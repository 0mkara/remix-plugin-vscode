import { CommandPlugin } from "@remixproject/engine-vscode";
import { window, OutputChannel, workspace } from "vscode";
import { fork, ChildProcess } from "child_process";
import * as path from "path";
import { ISources, CompilerInput, CompilerInputOptions, ICompilationResult } from "../types";

const profile = {
  name: 'solidity',
  displayName: 'Solidity compiler',
  description: 'Compile solidity contracts',
  kind: 'compiler',
  permission: true,
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/solidity_editor.html',
  version: '0.0.1',
  methods: ['getCompilationResult', 'compile', 'compileWithParameters', 'setCompilerConfig']
};

export default class NativeSolcPlugin extends CommandPlugin {
  private version: string = 'latest';
  private versions: Array<string>;
  private outputChannel: OutputChannel;
  private compilationResult: ICompilationResult;
  constructor() {
    super(profile);
    this.outputChannel = window.createOutputChannel("Remix IDE");
    this.loadSolidityVersions();
  }
  getVersion() {
    return 0.1;
  }
  private createWorker(): ChildProcess {
    // enable --inspect for debug
    // return fork(path.join(__dirname, "compile_worker.js"), [], {
    //   execArgv: ["--inspect=" + (process.debugPort + 1)]
    // });
    return fork(path.join(__dirname, "compile_worker.js"));
  }
  private getNow(): string {
    const date = new Date(Date.now());
    return date.toLocaleTimeString();
  }
  private print(m: string) {
    const now = this.getNow();
    this.outputChannel.appendLine(`[${now}]: ${m}`);
    this.outputChannel.show();
  }
  async compile(_version: string, opts: CompilerInputOptions) {
    this.print("Compilation started!")
    this.version = _version in this.versions ? this.versions[_version] : _version;
    const fileName = await this.call('fileManager', 'getCurrentFile')
    this.print(`Compiling ${fileName} ...`);
    const editorContent = window.activeTextEditor ? window.activeTextEditor.document.getText() : undefined;
    const sources: ISources = {};
    if (fileName) {
      sources[fileName] = {
        content: editorContent,
      };
    }
    const solcWorker = this.createWorker();
    console.log(`Solidity compiler invoked with WorkerID: ${solcWorker.pid}`);
    console.log(`Compiling with solidity version ${this.version}`);
    var input: CompilerInput = {
      language: opts.language,
      sources,
      settings: {
        outputSelection: {
          "*": {
            "": ["ast"],
            '*': [ 'abi', 'metadata', 'devdoc', 'userdoc', 'evm.legacyAssembly', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'evm.gasEstimates', 'evm.assembly' ]
          },
        },
        optimizer: {
          enabled: opts.optimize === true || opts.optimize === 1,
          runs: opts.runs || 200,
          details: {
            yul: Boolean(opts.language === 'Yul' && opts.optimize)
          }
        },
        libraries: opts.libraries,
      },
    };
    if (opts.evmVersion) {
      input.settings.evmVersion = opts.evmVersion
    }
    if (opts.language) {
      input.language = opts.language
    }
    if (opts.language === 'Yul' && input.settings.optimizer.enabled) {
      if (!input.settings.optimizer.details) 
        input.settings.optimizer.details = {}
      input.settings.optimizer.details.yul = true
    }
    solcWorker.send({
      command: "compile",
      root: workspace.workspaceFolders[0].uri.fsPath,
      payload: input,
      version: this.version,
    });
    solcWorker.on("message", (m: any) => {
      console.log(`............................Solidity worker message............................`);
      console.log(m);
      if (m.error) {
        this.print(m.error);
        console.error(m.error);
      } else if (m.data && m.path) {
        sources[m.path] = {
          content: m.data.content,
        };
        solcWorker.send({
          command: "compile",
          root: workspace.workspaceFolders[0].uri.fsPath,
          payload: input,
          version: this.version,
        });
      } else if (m.compiled) {
        const languageVersion = this.version;
        const compiled = JSON.parse(m.compiled);
        if (compiled.errors) {
          this.print(`Compilation error while compiling ${fileName} with solidity version ${m?.version}.`);
          logError(compiled?.errors)
        }
        if (compiled.contracts) {
          const source = { sources };
          const data = JSON.parse(m.compiled);
          this.compilationResult = {
            source: {
              sources,
              target: fileName
            },
            data
          }
          this.print(`Compilation finished for ${fileName} with solidity version ${m?.version}.`);
          this.emit('compilationFinished', fileName, source, languageVersion, data);
        }
      }
    })

    const errorKeysToLog = ['formattedMessage']
    const logError = (errors: any[]) => {
      for (let i in errors) {
        if (['number', 'string'].includes(typeof errors[i])) {
          if (errorKeysToLog.includes(i))
            this.print(errors[i])
        } else {
          logError(errors[i])
        }
      }
    }
  }
  getCompilationResult() {
    return this.compilationResult;
  }
  private loadSolidityVersions() {
    const solcWorker = this.createWorker();
    solcWorker.send({ command: "fetch_compiler_verison" });
    solcWorker.on("message", (m: any) => {
      this.versions = m.versions;
    });
  }
  getSolidityVersions() {
    return this.versions;
  }
}