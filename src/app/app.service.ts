import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  vscode: any;
  _message = new Subject();

  constructor() {
    this.vscode = window['acquireVsCodeApi']();

    window.addEventListener('message', event => {
      const message = event.data; // The JSON data our extension sent
      this._message.next(message);
    });
  }

  get message() {
    return this._message.asObservable();
  }

  selectGradleProject() {
    this.vscode.postMessage({
        command: 'select-gradle-project'
    });
  }

  loadTaskInfos() {
    this.vscode.postMessage({
        command: 'load-taskinfos'
    });
  }

  loadTaskInfo(taskinfoFile: string) {
    this.vscode.postMessage({
      command: 'load-taskinfo-file',
      taskinfoFile: taskinfoFile
    });
  }

  configureGradleTaskInfo() {
    this.vscode.postMessage({
      command: 'configure-gradle-taskinfo'
    });
  }

  runTiTaskOnTasks(tiTask: string, tasksToRunTiTasksOn: string, gradleProjectPath: string) {
    this.vscode.postMessage({
      command: 'run-taskinfo-task',
      tiTask,
      tasksToRunTiTasksOn,
      gradleProjectPath
    });
  }
}
