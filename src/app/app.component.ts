import { Component } from '@angular/core';
import { TreeNode } from 'primeng/api';

import { TranslateService } from '@ngx-translate/core';

import { SelectItem } from 'primeng/api';

import { AppService } from './app.service';


type Mode = 'Org' | 'Tree' | 'Order';

interface TaskInfo {
  name: string;
  path: string;
  finalizer: boolean;
  group: string;
  type: string;
  queuePosition: number;
  repeat?: boolean;
  dependencies?: TaskInfo[];
}

interface TiTask {
  name: string;
  tiTask: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {

  taskInfoFilesToLoad = [

  ];

  modes: SelectItem<Mode>[] = [
    { icon: 'pi pi-clone',   title: 'Tree',  value: 'Tree' },
    { icon: 'pi pi-sitemap', title: 'Org',   value: 'Org' },
    { icon: 'pi pi-bars',    title: 'Order', value: 'Order'},
  ];

  mode: Mode = this.modes[0].value;

  displayConfigureGradleTaskInfo = false;

  busy = false;

  taskinfoFilePath;

  taskinfoTreeNodes: TreeNode<TaskInfo>[] = [];

  taskinfos: TaskInfo[] = [];
  orderedTaskInfos: TaskInfo[] = [];

  gradleProjectPath = '';

  tiTasks: TiTask[] = [
    {name: 'tiJson', tiTask: 'tiJson'},
    {name: 'tiTree', tiTask: 'tiTree'},
    {name: 'tiOrder', tiTask: 'tiOrder'},
  ];

  tiTask = this.tiTasks[0].tiTask;

  tasksToRunTiTasksOn = 'build';

  constructor(
    private translate: TranslateService,
    private appService: AppService
  ) {
    this.translate.setDefaultLang('en');

    this.appService.message.subscribe((message: any) => {
      switch (message.command) {
        case 'selected-gradle-project':
          try {
            this.setGradleProjectPath(
              message.gradleProjectPath,
              message.taskinfoFiles);
          } finally {
            this.busy = false;
          }
          break;
        case 'loaded-taskinfos':
          try {
            this.loadTaskInfos(message.taskinfoFilePath, message.taskinfos);
            if (message.taskinfoFiles) {
              this.setTasknfoFiles(message.taskinfoFiles);
            }
          } finally {
            this.busy = false;
          }
          break;
        case 'cancelled-load-taskinfos':
          this.busy = false;
          break;
      }
    });
  }

  selectGradleProjectStart(): void {
    this.busy = true;
    this.appService.selectGradleProject();
  }

  setGradleProjectPath(gradleProjectPath: string, taskinfoFiles: string[]) {
    this.gradleProjectPath = gradleProjectPath;
    if (taskinfoFiles && taskinfoFiles.length > 0) {
      this.setTasknfoFiles(taskinfoFiles);
    }
  }

  setTasknfoFiles(taskinfoFiles: string[]) {
    this.taskInfoFilesToLoad = [];
    taskinfoFiles.forEach(taskinfoFile => {
      this.taskInfoFilesToLoad.push({
        label: taskinfoFile,
        command: this.loadTaskInfoFileStart.bind(this, taskinfoFile)
      });
    });
  }

  loadTaskInfosStart(): void {
    this.busy = true;
    this.appService.loadTaskInfos();
  }

  loadTaskInfoFileStart(taskinfoFile: string): void {
    this.appService.loadTaskInfo(taskinfoFile);
  }

  loadTaskInfos(taskinfoFilePath: string, taskinfos: TaskInfo): void {
    this.taskinfoFilePath = taskinfoFilePath;
    this.taskinfos = [ taskinfos ];
    this.orderedTaskInfos = [];
    this.taskinfoTreeNodes = this.taskinfosToTreeNodes(this.taskinfos, this.orderedTaskInfos, []);
    // Sort
    this.orderedTaskInfos.sort((tia: TaskInfo, tib: TaskInfo) => {
      if (tia.queuePosition > tib.queuePosition) {
        return 1;
      } else if (tia.queuePosition < tib.queuePosition) {
        return -1;
      } else {
        return 0;
      }
    });
  }

  taskinfosToTreeNodes(taskinfos: Array<TaskInfo>, orderedTaskInfos: Array<TaskInfo>, seen: Array<string>): TreeNode[] {
    const taskinfoTreeNodes: TreeNode[] = [];
    taskinfos.forEach((taskinfo: TaskInfo) => {
      const treeNode = {
        data: taskinfo,
        children: [],
        expanded: false
      };
      if (seen.indexOf(taskinfo.path) === -1) {
        seen.push(taskinfo.path);
        treeNode.data.repeat = false;
        orderedTaskInfos.push(taskinfo);
      } else {
        treeNode.data.path += ' (Repeat)';
        treeNode.data.repeat = true;
      }
      if (taskinfo.dependencies && taskinfo.dependencies.length > 0) {
        treeNode.children = this.taskinfosToTreeNodes(
          taskinfo.dependencies,
          orderedTaskInfos,
          seen
        );
      }
      if (treeNode.children) {
        treeNode.expanded = true;
      }
      taskinfoTreeNodes.push(treeNode);
    });
    return taskinfoTreeNodes;
  }

  showConfigureGradleTaskInfo() {
    this.displayConfigureGradleTaskInfo = true;
  }

  configureGradleTaskInfoStart(): void {
    this.appService.configureGradleTaskInfo();
  }

  runTiTaskOnTasks() {
    this.appService.runTiTaskOnTasks(this.tiTask, this.tasksToRunTiTasksOn, this.gradleProjectPath);
  }
}
