import {TreeItem, TreeDataProvider, EventEmitter, Event, TreeItemCollapsibleState, Command} from "vscode";
import { Uri } from "vscode";
import { PluginData } from "./pluginlist";
import { PluginInfo } from "./types";

export class RmxPluginsProvider implements TreeDataProvider<PluginInterface> {
  private _onDidChangeTreeData: EventEmitter<PluginInterface | undefined> = new EventEmitter<PluginInterface | undefined>();
  readonly onDidChangeTreeData: Event<PluginInterface | undefined> = this._onDidChangeTreeData.event;
  private data: PluginInfo[];

  constructor(private workspaceRoot: string) {
    this.data = PluginData;
  }

  add(data: PluginInfo): void {
    this.data.push(data);
    this._onDidChangeTreeData.fire(null);
  }

  remove(id: string):void {
    this.data = this.data.filter((plugin: PluginInfo)=>{
      return plugin.name != id
    })
    this._onDidChangeTreeData.fire(null);
  }

  refresh():void {
    this.data = PluginData
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: PluginInterface): TreeItem {
    return element;
  }

  getChildren(element?: PluginInterface): Thenable<PluginInterface[]> {
    return this.getRmxPlugins().then((children) => {
      return Promise.resolve(children);
    });
  }
  private toPlugin = (pluginName: string, id: string, version: string, icon: string): PluginInterface => {
    return new PluginInterface(
      pluginName,
      id,
      version,
      TreeItemCollapsibleState.None,
      {
        command: "rmxPlugins.showPluginOptions",
        title: pluginName,
        arguments: [id],
      },
      Uri.parse(icon)
    );
  };

  private async getRmxPlugins(): Promise<PluginInterface[]> {
    try {
      const plugins = this.data
        ? this.data.map((plugin) => this.toPlugin(plugin.displayName, plugin.name, plugin.version, plugin.icon))
        : [];
      return Promise.resolve(plugins);
    } catch (error) {
      throw error;
    }
  }
}

export class PluginInterface extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly id: string,
    private version: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly command?: Command,
    public readonly iconURI?: Uri
  ) {
    super(label, collapsibleState);
  }
  tooltip = `${this.label}-${this.version}`;
  description = this.version;
  iconPath = {
    light: this.iconURI,
    dark: this.iconURI,
  };
  contextValue = "options";
}
