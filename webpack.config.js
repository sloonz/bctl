const webpack = require('webpack');

module.exports = {
    context: __dirname,
    entry: './main',
    target: 'node',
    output: {
        path: __dirname + '/build',
        filename: 'bctl'
    },
    module: {
        loaders: [
            { test: /\.js$/, exclude: /node_modules/, loader: 'babel-loader', query: { presets: ['es2015'] } }
        ]
    },
    plugins: [
        new webpack.optimize.UglifyJsPlugin({ test: /bctl/ }),
        new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true })
    ]
};
