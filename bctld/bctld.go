package main

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"time"
)

// There is 3 types of connection
// 
// (1) bctl <-> bctld
// (2) bctld <-> master
// (3) bctld <-> slave
// 
// (1): two commands:
// 	(bctl -> bctld) LIST
// 	(bctl <- bctld) returns a list of browsers (browser-id browser-name)
// 
// 	(bctl -> bctld) TUNNEL browser-id: open a bidirectionnal channel with browser-id (with a slave connection)
// (2): three commands :
// 	(bctld <- master) REGISTER: signals that the browser is ready to communicate with bctl instances
// 	
// 	(bctld <-> master) PING: both ways, issued every 10s to mainain the connection (bctld -> master and then master -> bctld as reply)
// 
// 	(bctld -> master) CONN conn-id: signals that a bctl instance wants to establish a connection
// 
// (3): one command :
// 	(bctld <- slave) CONN conn-id: establish the connection with the bctl instance over this channel

type browser struct {
	conn     *net.TCPConn
	name     string
	sendChan chan string
}

var browsers map[string]browser
var clients map[string]*net.TCPConn

func doList(conn *net.TCPConn) {
	defer conn.Close()

	for bid, b := range browsers {
		_, err := conn.Write([]byte(fmt.Sprintf("%v %v\n", bid, b.name)))
		if err != nil {
			fmt.Fprintf(os.Stderr, "[client %v] write() %v\n", conn.RemoteAddr().String(), err.Error())
			return
		}
	}
	_, err := conn.Write([]byte("\n"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "[client %v] write() %v\n", conn.RemoteAddr().String(), err.Error())
		return
	}
}

func doTunnel(conn *net.TCPConn, bid string) {
	fmt.Fprintf(os.Stderr, "New client: %v\n", conn.RemoteAddr().String())

	browsers[bid].sendChan <- fmt.Sprintf("CONN %v\n", conn.RemoteAddr().String())
	clients[conn.RemoteAddr().String()] = conn
}

func doRegister(conn *net.TCPConn, bname string) {
	fmt.Fprintf(os.Stderr, "New master: %v\n", conn.RemoteAddr().String())

	ch := make(chan string)
	browsers[conn.RemoteAddr().String()] = browser{conn, bname, ch}

	defer conn.Close()
	defer close(ch)
	defer delete(browsers, conn.RemoteAddr().String())
	defer fmt.Fprintf(os.Stderr, "[master %v] closed\n", conn.RemoteAddr().String())

	go (func() {
		for {
			data := <-ch
			if data == "" {
				return
			}

			n, err := conn.Write([]byte(data))
			if n == 0 || err == io.EOF {
				return
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "[master %v]: write(): %v\n", conn.RemoteAddr().String(), err.Error())
				return
			}
		}
	})()

	go (func() {
		defer func() { recover() }()
		for {
			ch <- "PING\n"
			time.Sleep(time.Duration(10e9)) // 10s
		}
	})()

	buf := make([]byte, 512)
	for {
		n, err := conn.Read(buf)
		if n == 0 || err == io.EOF {
			break
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "[master %v]: read(): %v\n", conn.RemoteAddr().String(), err.Error())
			break
		}
	}
}

func copyAll(reader *net.TCPConn, writer *net.TCPConn, c *sync.Cond) {
	buf := make([]byte, 512)
	for {
		n, err := reader.Read(buf)
		if n == 0 || err == io.EOF {
			break
		} else if err != nil {
			fmt.Fprintf(os.Stderr, "copyAll(): %v\n", err.Error())
			break
		}

		n, err = writer.Write(buf[:n])
		if n == 0 || err == io.EOF {
			break
		} else if err != nil {
			fmt.Fprintf(os.Stderr, "copyAll(): %v\n", err.Error())
			break
		}
	}
	c.Signal()
}

func doConn(conn *net.TCPConn, cid string) {
	c := sync.NewCond(new(sync.Mutex))

	fmt.Fprintf(os.Stderr, "New slave: %v\n", conn.RemoteAddr().String())

	cconn := clients[cid]
	defer fmt.Fprintf(os.Stderr, "Closed connection between [slave %v] and [client %v]\n", conn.RemoteAddr().String(), cconn.RemoteAddr().String())

	go copyAll(cconn, conn, c)
	go copyAll(conn, cconn, c)
	c.L.Lock()
	c.Wait()

	conn.Close()
	cconn.Close()
	delete(clients, cid)
}

func handleClient(conn *net.TCPConn) {
	line, err := readLine(conn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "handleClient(): readLine(%d): %v\n", conn.RemoteAddr().String(), err.Error())
		conn.Close()
		return
	}

	if line == "LIST" {
		doList(conn)
	} else if strings.HasPrefix(line, "TUNNEL ") {
		doTunnel(conn, line[strings.Index(line, " ")+1:])
	} else if strings.HasPrefix(line, "REGISTER ") {
		doRegister(conn, line[strings.Index(line, " ")+1:])
	} else if strings.HasPrefix(line, "CONN ") {
		doConn(conn, line[strings.Index(line, " ")+1:])
	} else {
		fmt.Fprintf(os.Stderr, "handleClient(): unknown command %s\n", line)
		conn.Close()
	}
}

func readLine(r io.Reader) (string, error) {
	buf := bytes.NewBuffer(nil)
	cBuf := make([]byte, 1)
	for {
		n, err := r.Read(cBuf)
		if n == 0 || err == io.EOF {
			return "", io.ErrUnexpectedEOF
		}
		if err != nil {
			return "", err
		}
		if cBuf[0] == '\n' {
			return buf.String(), nil
		} else {
			buf.WriteByte(cBuf[0])
		}
	}
	return "", nil
}

func main() {
	listener, err := net.Listen("tcp", "127.0.0.1:12346")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't listen: %v\n", err.Error())
		os.Exit(1)
	}

	browsers = make(map[string]browser)
	clients = make(map[string]*net.TCPConn)

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Fprintf(os.Stderr, "accept failed: %v\n", err.Error())
			continue
		}

		go handleClient(conn.(*net.TCPConn))
	}
}
