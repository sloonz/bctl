module.exports = {
    compareObjects(a, b, keys) {
        for(let k of keys) {
            if(a[k] < b[k]) {
                return -1;
            } else if(a[k] > b[k]) {
                return 1;
            }
        }

        return 0;
    }
};
