const path = require('path');
const vscode = require('vscode');
const fs = require('fs');

// 打开列表
async function showQuickPickAsync () {
	// 获取配置信息
	const configuration = vscode.workspace.getConfiguration();
	const tabList = configuration.get('TabManager.tabList');
	if (!tabList) return null;

	// 用户选择
	const res = await vscode.window.showQuickPick(tabList.map(item => item.tabName), {
		placeHolder: 'select tab',
	});

	// 返回选择的配置内容
	return res ? tabList.find(item => item.tabName === res) : null;
}

// 组装URL
async function getTabUrlAsync(selectedTab) {
	const {URL} = require('url');
	const {tabUrl, params = {}, useGitParams, branchKey, packageParams} = selectedTab;
	const urlObj = new URL(tabUrl);
	Object.keys(params).forEach(key => urlObj.searchParams.set(key, params[key]));

	// git branch
	if (useGitParams) {
		const branchK = branchKey || 'branch';
		const branchName = await getGitBranchNameAsync();
		urlObj.searchParams.set(branchK, branchName);
	}
	// package.json
	if (packageParams) {
		const searchParams = await getPakcageJosnConfig(packageParams);
		Object.keys(searchParams).forEach(key => urlObj.searchParams.set(key, searchParams[key]));
	}

	return urlObj.toString();
}

function packageExists(filePath) {
    try {
        return require.resolve(filePath);
    } catch (error) {
        return false;
    }
}

// 读取package.json
function getPakcageJosnConfig (packageParams) {
	return new Promise ((resolve) => {
		const filePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'package.json');
		if (packageExists(filePath)) {
			fs.readFile(filePath, (err, data) => {
				if (err) {
					vscode.window.showErrorMessage(`get-package.josn-err-${err.message}`);
				};
				const pkg = JSON.parse(data.toString());
				if (Array.isArray(packageParams)) { // array
					return resolve(packageParams.reduce((pre, cur) => {
						if (pkg[cur] && typeof pkg[cur] === 'string') {
							pre[cur] = pkg[cur];
						}
						return pre;
					}, {}));
				} else if (typeof packageParams === 'object') { // object
					try {
						return resolve(Object.keys(packageParams).reduce((pre, cur) => {
							if (pkg[cur] && typeof pkg[cur] === 'string') {
								pre[packageParams[cur]] = pkg[cur];
							}
							return pre;
						}, {}));
					} catch (error) {
						vscode.window.showErrorMessage(`get-packageParams-err-${err.message}`);
					}
				}
				resolve({});
			});
		} else {
			vscode.window.showErrorMessage(`get-package.josn-err-package.josn not found`);
			resolve({});
		}
	});	
}

// 获取分支名称
async function getGitBranchNameAsync () {
	return runCommandAsync('git', ['branch', '--show-current'], {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath}).catch(err => {
		vscode.window.showErrorMessage(`get-branch-err-${err.message}`);
		return ''
	});
}

// 运行命令
function runCommandAsync (command, args, options) {
	const cp = require("child_process");
	let message = '';
	return new Promise((resolve, reject) => {
		const executedCommand = cp.spawn(command, args, {
			shell: true,
			...options
		});

		executedCommand.stdout.on('data', data => {
			message += data;
		})

		executedCommand.on("error", error => {
			reject(error);
		});

		executedCommand.on("exit", code => {
			if (code === 0) {
				resolve(message.trim());
			} else {
				reject();
			}
		});
	});
};

// 打开页面
async function printDefinitionsForActiveEditor(selectedTab) {
	const url = await getTabUrlAsync(selectedTab);

	if (selectedTab.useBrowser) {
		return vscode.env.openExternal(vscode.Uri.parse(url))
	}

    // 创建并显示新的webview
	const panel = vscode.window.createWebviewPanel(
		selectedTab.tabName,
		selectedTab.tabName,
		{
			viewColumn: vscode.ViewColumn.Three
		},
		{
			enableScripts: true,
		}
	);
	panel.webview.html = `
		<!DOCTYPE html>
		<html lang="en" style="width:100%;height:100%">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Cat Coding</title>
		</head>
		<body style="width:100%;height:100%">
			<iframe sandbox="allow-same-origin allow-scripts allow-popups allow-forms" width="100%" height="100%" src="${url}"/>
		</body>
		</html>
	`
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// 用console输出诊断信息(console.log)和错误(console.error)
    // 下面的代码只会在你的插件激活时执行一次
	console.log('Congratulations, your extension "TabManager" is now active!');

	// 入口命令已经在package.json文件中定义好了，现在调用registerCommand方法
    // registerCommand中的参数必须与package.json中的command保持一致
	let disposable = vscode.commands.registerCommand('TabManager.openNewTab', async function () {
		// 把你的代码写在这里，每次命令执行时都会调用这里的代码
		console.log('TabManager.openNewTab run!');

		// 用户选择要打开的tab
		const selectedTab = await showQuickPickAsync();
		if(!selectedTab) {
			return vscode.window.showInformationMessage('TabManager congratulations empty!');
		};

		// 打开页面
		printDefinitionsForActiveEditor(selectedTab).catch(err => {
			vscode.window.showErrorMessage(err.message);
		});
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
