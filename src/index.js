var fs = require("fs");
var path = require("path");
var vm = require("vm");

var execSync = require("exec-sync");
var EventEmitter = require("events").EventEmitter;

var jsdom = require("jsdom").jsdom;
var Inflect = require("inflect-js");

/*
 * constructor function
 */
function ElmRunner(filename, defaults) {
  this.filename = filename;
  this.defaults = defaults || {};

  this.baseName = path.basename(filename, path.extname(filename));
  this.moduleName = Inflect.classify(this.baseName);

  this.outputPath = path.join(path.dirname(filename), this.baseName + ".js");

  var self = this;
  withCheckedPath(this.outputPath, function() {
    compile.call(self);
    execute.call(self);
    wrap.call(self);
  });
}

/**
 * expose a function that wraps new instances
 */
module.exports = function(filename, defaults) {
  return new ElmRunner(filename, defaults);
};

function withCheckedPath(outputPath, callback) {
  if (fs.existsSync(outputPath)) {
    throw "Elm: File with name (" + outputPath + ") would be overwritten";
  } else {
    callback();
    fs.unlinkSync(outputPath);
  }
}

/**
 * run elm module through `elm-make` to generate compiled js
 */
function compile() {
  execSync("elm-make " + this.filename + " --output " + this.outputPath);
}

/**
 * execute script generated by elm-make in a vm context
 */
function execute() {
  var context = getDefaultContext();
  var compiledOutput = fs.readFileSync(this.outputPath)

  vm.runInContext(compiledOutput, context, this.outputPath);

  this.compiledModule = context.Elm.fullscreen(context.Elm[this.moduleName], this.defaults);
}

/**
 * wrap compiled and executed object in EventEmitters
 */
function wrap() {
  var ports = this.compiledModule.ports;

  var incomingEmitter = new EventEmitter();
  var outgoingEmitter = new EventEmitter();

  var emit = incomingEmitter.emit.bind(incomingEmitter);

  Object.keys(ports).forEach(function(key) {
    outgoingEmitter.addListener(key, function() {
      var args = Array.prototype.slice.call(arguments)

      ports[key].send.apply(ports[key], args);
    });

    if (ports[key].subscribe) {
      ports[key].subscribe(function() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(key);

        emit.apply(incomingEmitter, args);
      });
    }
  });

  incomingEmitter.emit = outgoingEmitter.emit.bind(outgoingEmitter);;

  this.emitter = incomingEmitter;
}

function getDefaultContext() {
  var document = jsdom();

  return vm.createContext({
    document: document,
    window: document.parentWindow,

    setInterval: setInterval,
    clearInterval: clearInterval,

    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  });
}