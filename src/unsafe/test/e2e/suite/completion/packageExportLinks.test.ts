import * as assert from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';
import { getDocPath, getDocUri, showFile, sleep } from '../util';

describe('SCSS Package Export Links Test', () => {
	const docUri = getDocUri('completion/package-exports.scss');

	before(async () => {
		await showFile(docUri);
		await sleep(2000);
	});

	it('Links package exports to the target file', async () => {
		const target = getDocPath('completion/node_modules/@scope/exports-test/dist/waitrose/web/spacing.scss');

		const links = (await vscode.commands.executeCommand(
			'vscode.executeLinkProvider',
			docUri
		)) as vscode.DocumentLink[];

		assert.ok(
			links.some(l => l.target && path.normalize(l.target.fsPath) === path.normalize(target)),
			`No link to ${target} in ${JSON.stringify(links.map(l => l.target?.toString()))}`
		);
	});
});
