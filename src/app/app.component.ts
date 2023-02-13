import { AfterViewInit, Component, Inject } from '@angular/core';
import { TreeNode } from 'primeng/api';

import { TranslateService } from '@ngx-translate/core';

import { SelectItem } from 'primeng/api';

import { AppService } from './app.service';
import { DOCUMENT } from '@angular/common';


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
export class AppComponent implements AfterViewInit {

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

  interestingTasks = [
      'assemble'
    , 'autoLintGradle'
    , 'bootBuildImage'
    , 'bootJar'
    , 'bootJarMainClassName'
    , 'bootRun'
    , 'bootRunMainClassName'
    , 'build'
    , 'buildDependents'
    , 'buildEnvironment'
    , 'buildNeeded'
    , 'check'
    , 'classes'
    , 'clean'
    , 'compileJava'
    , 'compileTestJava'
    , 'components'
    , 'criticalLintGradle'
    , 'dependencies'
    , 'dependencyInsight'
    , 'dependencyManagement'
    , 'dependencyUpdates'
    , 'dependentComponents'
    , 'fixGradleLint'
    , 'fixLintGradle'
    , 'generateGradleLintReport'
    , 'help'
    , 'init'
    , 'jar'
    , 'javadoc'
    , 'javaToolchains'
    , 'lintGradle'
    , 'model'
    , 'outgoingVariants'
    , 'prepareKotlinBuildScriptModel'
    , 'processResources'
    , 'processTestResources'
    , 'projects'
    , 'properties'
    , 'tasks'
    , 'test'
    , 'testClasses'
    , 'wrapper'
  ];

  suggestedTasks = this.interestingTasks;

  tasksToRunTiTasksOn = 'build';

  constructor(
    private translate: TranslateService,
    private appService: AppService,
    @Inject(DOCUMENT) private document: Document
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
        case 'cancelled-select-gradle-project':
        case 'cancelled-load-taskinfos':
          this.busy = false;
          break;
        case 'colorTheme':
          this.adjustTheme();
          break;
      }
    });
  }

  ngAfterViewInit(): void {
    this.adjustTheme();
  }

  adjustTheme() {
    let theme = 'light-theme';
    if (document.body.classList.contains('vscode-light')) {
      theme = 'light-theme';
    } else if (document.body.classList.contains('vscode-dark')) {
      theme = 'dark-theme';
    }
    const themeLink = this.document.getElementById('app-theme') as HTMLLinkElement;
    if (themeLink) {
        themeLink.href = theme + '.css';
    }
  }

  matchTasks(event) {
    this.suggestedTasks =  this.interestingTasks.filter(task => task.toLowerCase().startsWith(event.query.toLowerCase()));
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
    this.taskinfoTreeNodes = this.taskinfosToTreeNodes(
      this.taskinfos,
      this.orderedTaskInfos,
      []);
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
