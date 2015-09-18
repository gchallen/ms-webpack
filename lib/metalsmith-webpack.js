import webpack from "webpack";
import path from "path";
import MemoryFs from "memory-fs";
import supportsColor from "supports-color";
import chalk from "chalk";

export default function(options) {
  let _metalsmith;
  let _files;

  options = {
    ...options,
    context: path.resolve(options.context || process.cwd()),
    output: {
      ...options.output,
      path: path.resolve(options.output.path || process.cwd())
    },
    watch: false
  };

  let defaultOutputOptions = {
    colors: supportsColor,
    chunks: true,
    modules: true,
    chunkModules: true,
    reasons: true,
    cached: true,
    cachedAssets: true
  };

  if (options.stats && !options.stats.json) {
    defaultOutputOptions = {
      ...defaultOutputOptions,
      cached: false,
      cachedAssets: false,
      exclude: ["node_modules", "bower_components", "jam", "components"]
    };
  }

  let outputOptions = {
    ...defaultOutputOptions,
    ...(options.stats || options.stats || {})
  };

  let compiler = webpack(options);
  let fs = compiler.outputFileSystem = new MemoryFs();
  let lastHash = null;

  compiler.plugin("emit", (compilation, callback) => {
    let stats = compilation.getStats().toJson();
    let metadata = _metalsmith.metadata();
    var assetsByChunkName = stats.assetsByChunkName;

    let assets = Object.keys(assetsByChunkName).reduce((reduced, chunkName) => {
      let chunkAsset = assetsByChunkName[chunkName];

      if (Array.isArray(chunkAsset)) {
        let chunkAssets = chunkAsset.reduce((chunkObj, file) => {
          chunkObj[chunkName + path.extname(file)] = file;
          return chunkObj;
        }, {});
        return {
          ...reduced,
          ...chunkAssets
        };
      }

      reduced[chunkName + path.extname(chunkAsset)] = chunkAsset;
      return reduced;
    }, {});

    let assetsByType = Object.keys(assets).reduce((reduced, assetName) => {
      let ext = path.extname(assetName).replace(/^\./, "");
      reduced[ext] = [assets[assetName]].concat(reduced[ext] || []);
      return reduced;
    }, {});

    metadata.webpack = { assets, assetsByType };

    callback();
  });

  compiler.plugin("after-emit", (compilation, callback) => {
    Object.keys(compilation.assets).forEach(outname => {
      let asset = compilation.assets[outname];
      let filePath = asset.existsAt;
      let name = path.relative(_metalsmith.destination(), filePath);

      if (asset.emitted) {
        let contents = fs.readFileSync(filePath);
        _files[name] = {};
        _files[name].contents = contents;
        _files[name].fileName = filePath;
      }
    });

    _metalsmith.write(_files, err => {
      console.log();
      Object.keys(_files).forEach(fileName => {
        console.log(`${chalk.magenta("[metalsmith-webpack]")} writing ${chalk.cyan(fileName)}`);
      });
      if (err) {
        callback(err);
      }
      callback();
    });
  });


  return function(files, metalsmith, done) {

    if (!options.entry || !options.output.filename) {
      return done(null, files);
    }

    _metalsmith = metalsmith;
    _files = {};

    console.log(`\n${chalk.magenta("[metalsmith-webpack]")} starting`);

    options = {
      ...options,
      context: path.resolve(options.context || process.cwd()),
      output: {
        ...options.output,
        path: path.resolve(options.output.path || process.cwd())
      },
      watch: false
    };  

    compiler.run((err, stats) => {
      compiler.purgeInputFileSystem();

      if (err) {
        return done(err);
      }

      if (outputOptions.json) {
        console.log();
        console.log(JSON.stringify(stats.toJson(outputOptions), null, 2));
        console.log();
      } else if (stats.hash !== lastHash) {
        lastHash = stats.hash;
        let prefix = `\n${chalk.magenta("[metalsmith-webpack]")} `;
        let output = stats.toString(outputOptions).split("\n").join(prefix);
        console.log(prefix + output);
        console.log();
      }

      files = {
        ..._files,
        files
      };

      done(null, files);
    });

  };
};