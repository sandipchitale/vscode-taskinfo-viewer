import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Manages webview panels
 */
class TaskInfoViewPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: TaskInfoViewPanel | undefined;

  private static readonly viewType = 'Taskinfo';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionPath: string;
  private readonly builtAppFolder: string;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionPath: string): TaskInfoViewPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    // Otherwise, create Taskinfo panel.
    if (TaskInfoViewPanel.currentPanel) {
      TaskInfoViewPanel.currentPanel.panel.reveal(column);
    } else {
      TaskInfoViewPanel.currentPanel = new TaskInfoViewPanel(extensionPath, column || vscode.ViewColumn.One);
    }
    return TaskInfoViewPanel.currentPanel;
  }

  static configureGradleTaskInfo() {
    vscode.window.showInformationMessage(
      'Globally configure gradle-taskinfo plugin in <HOME>/.gradle/init.d/apply-gradle-taskinfo.gradle.',
      'Proceed',
      'Cancel').then((action) => {
        if ('Proceed' === action) {
          const initDotD = path.join(os.homedir(), '.gradle', 'init.d');
          const applyGradleTaskinfoDotGradle = path.join(initDotD, 'apply-gradle-taskinfo.gradle');
          if (!fs.existsSync(applyGradleTaskinfoDotGradle)) {
            fs.mkdirSync(initDotD, { recursive: true });
            fs.writeFileSync(path.join(initDotD, 'apply-gradle-taskinfo.gradle'), `
initscript {
  repositories {
    maven {
      url "https://plugins.gradle.org/m2/"
    }
  }
  dependencies {
    classpath "gradle.plugin.org.barfuin.gradle.taskinfo:gradle-taskinfo:1.0.5"
  }
}

rootProject {
  apply plugin: org.barfuin.gradle.taskinfo.GradleTaskInfoPlugin

  taskinfo {
    clipped = true
    color = false
  }
}
          ` );
          }
        }
    });
  }

  private constructor(extensionPath: string, column: vscode.ViewColumn) {
    this.extensionPath = extensionPath;
    this.builtAppFolder = 'dist';

    // Create and show a new webview panel
    this.panel = vscode.window.createWebviewPanel(TaskInfoViewPanel.viewType, 'Taskinfo View', column, {
      // Enable javascript in the webview
      enableScripts: true,

      retainContextWhenHidden: true,

      // And restrict the webview to only loading content from our extension's `media` directory.
      localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, this.builtAppFolder))]
    });

    // Set the webview's initial html content
    this.panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: any) => {
        switch (message.command) {
          case 'select-gradle-project':
            this.selectGradleProject();
            break;
          case 'load-taskinfos':
            vscode.window.showOpenDialog({
              openLabel: 'Select taskinfo json file',
              filters:  {
                'Taskinfo file': ['json']
              }
            }).then((uris) => {
              if (uris && uris.length > 0) {
                const taskinfoFilePath = uris[0].fsPath;
                this.openTaskinfoFile(taskinfoFilePath);
              } else {
                this.panel.webview.postMessage({ command: 'cancelled-load-taskinfos'});
              }
            });
            break;
          case 'load-taskinfo-file':
            this.openTaskinfoFile(message.taskinfoFile);
            break;
          case 'configure-gradle-taskinfo':
            TaskInfoViewPanel.configureGradleTaskInfo();
            break;
          case 'run-taskinfo-task':
            this.runTiTaskOnTasks(message.tiTask, message.tasksToRunTiTasksOn, message.gradleProjectPath);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  selectGradleProject() {
    vscode.window.showOpenDialog({
      openLabel: 'Select Gradle project',
      canSelectFolders: true,
      canSelectFiles: false
    }).then((uris) => {
      if (uris && uris.length > 0) {
        const gradleProjectPath = uris[0].fsPath;
        this.setGradleProjectPath(gradleProjectPath);
      } else {
        this.panel.webview.postMessage({
          command: 'cancelled-select-gradle-project'
        });
      }
    });
  }

  setGradleProjectPath(gradleProjectPath: string) {
    const taskinfoDirPath = path.join(gradleProjectPath, 'build', 'taskinfo');
    let taskinfoFiles: Array<string> = [];
    try {
      if (fs.existsSync(taskinfoDirPath)) {
        taskinfoFiles = fs.readdirSync(taskinfoDirPath)
        .filter(maybeTaskinfoFile => {
          return (maybeTaskinfoFile.startsWith('taskinfo-') && maybeTaskinfoFile.endsWith('.json'));
        })
        .map(maybeTaskinfoFile => {
          return path.join(taskinfoDirPath, maybeTaskinfoFile);
        });
      }
    } catch (error) {
    }
    this.panel.webview.postMessage({
      command: 'selected-gradle-project',
      gradleProjectPath,
      taskinfoFiles
    });
  }

  openTaskinfoFile(taskinfoFilePath: string) {
    const taskinfoDirPath = path.dirname(taskinfoFilePath);
    let taskinfoFiles = [];
    try {
      taskinfoFiles = fs.readdirSync(taskinfoDirPath)
      .filter(maybeTaskinfoFile => {
        return (maybeTaskinfoFile.startsWith('taskinfo-') && maybeTaskinfoFile.endsWith('.json'));
      })
      .map(maybeTaskinfoFile => {
        return path.join(taskinfoDirPath, maybeTaskinfoFile);
      });
    } finally {
      // ignore
    }
    this.panel.webview.postMessage({
      command: 'loaded-taskinfos',
      taskinfoFilePath,
      taskinfoFiles,
      taskinfos: JSON.parse(
        fs.readFileSync(taskinfoFilePath, {
          encoding: 'utf8',
          flag: 'r',
        })
      )});
  }

  runTiTaskOnTasks(tiTask: string, tasksToRunTiTasksOn: string, gradleProjectPath: string) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      let taskinfoTaskTerminal;
      vscode.window.terminals.forEach(terminal => {
        if (terminal && 'Taskinfo task' === terminal.name ) {
          taskinfoTaskTerminal = terminal;
        }
      });

      const gradleProjectDir = (gradleProjectPath ? gradleProjectPath : workspaceFolder.uri.fsPath);
      if (!taskinfoTaskTerminal) {
        taskinfoTaskTerminal = vscode.window.createTerminal({
          name: 'Taskinfo task',
          cwd: gradleProjectDir
        });
      }
      taskinfoTaskTerminal.show(true);

      if (process.platform === 'win32') {
        taskinfoTaskTerminal.sendText(`cd /D "${gradleProjectDir}"\n`);
      } else {
        taskinfoTaskTerminal.sendText(`cd "${gradleProjectDir}"\n`);
      }
      taskinfoTaskTerminal.sendText(`gradlew ${tiTask} ${tasksToRunTiTasksOn}\n`);
      if ('tiJson' === tiTask) {
        vscode.window
          .showInformationMessage(
            `Open ${path.join(gradleProjectDir, 'build', 'taskinfo', 'taskinfo-' + tasksToRunTiTasksOn + '.json')} once it is generated ?`,
            'Open',
            'No')
          .then((action) => {
            if ('Open' === action) {
              this.openTaskinfoFile
                (path.join(gradleProjectDir, 'build', 'taskinfo', 'taskinfo-' + tasksToRunTiTasksOn + '.json'));
            }
          });
      }
    }
  }

  public dispose() {
    TaskInfoViewPanel.currentPanel = undefined;

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  /**
   * Returns html of the start page (index.html)
   */
  private _getHtmlForWebview() {
    // path to dist folder
    const appDistPath = path.join(this.extensionPath, 'dist');
    const appDistPathUri = vscode.Uri.file(appDistPath);

    // path as uri
    const baseUri = this.panel.webview.asWebviewUri(appDistPathUri);

    // get path to index.html file from dist folder
    const indexPath = path.join(appDistPath, 'index.html');

    // read index file from file system
    let indexHtml = fs.readFileSync(indexPath, { encoding: 'utf8' });

    // update the base URI tag
    indexHtml = indexHtml.replace('<base href="/">', `<base href="${String(baseUri)}/">`);

    return indexHtml;
  }
}

// Utility
const isFile = (fsPath: string) => {
  try {
    return fs.statSync(fsPath) && fs.statSync(fsPath).isFile();
  } catch (e) {
    return false;
  }
};

/**
 * Activates extension
 * @param context vscode extension context
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-taskinfo-viewer', () => {
      const taskInfoViewPanel = TaskInfoViewPanel.createOrShow(context.extensionPath);
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        if (isFile(path.join(workspaceFolder.uri.fsPath, 'build.gradle'))) {
          setTimeout(() => {
            taskInfoViewPanel.setGradleProjectPath(workspaceFolder.uri.fsPath);
          }, 1000);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-taskinfo-viewer.open-in', (uri) => {
      if (uri && uri.scheme === 'file') {
        const mayBeTaskinfoFilePath = uri.fsPath;
        if (mayBeTaskinfoFilePath && isFile(mayBeTaskinfoFilePath) && '.json' === path.extname(mayBeTaskinfoFilePath).toLowerCase()) {
          const taskInfoViewPanel = TaskInfoViewPanel.createOrShow(context.extensionPath);
          setTimeout(() => {
            taskInfoViewPanel.openTaskinfoFile(mayBeTaskinfoFilePath);
          }, 500);
        }
      }
    })
  );

  vscode.commands.executeCommand('setContext', 'isGradleFolder', false);
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    if (isFile(path.join(workspaceFolder.uri.fsPath, 'build.gradle'))) {
      vscode.commands.executeCommand('setContext', 'isGradleFolder', true);
    }
  }
}
