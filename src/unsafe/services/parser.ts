'use strict';

import { SymbolKind, DocumentLink } from 'vscode-css-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import { INode, NodeType } from '../types/nodes';
import type { IDocument, IDocumentSymbols, IVariable, IImport } from '../types/symbols';
import { getNodeAtOffset, getParentNodeByType } from '../utils/ast';
import { buildDocumentContext } from '../utils/document';
import { resolvePackageImport } from '../utils/package';
import { getLanguageService } from '../language-service';

const reDynamicPath = /[#{}\*]/;

const ls = getLanguageService();

/**
 * Returns all Symbols in a single document.
 */
export async function parseDocument(document: TextDocument, offset: number | null = null): Promise<IDocument> {
	const documentPath = URI.parse(document.uri).fsPath;
	const ast = ls.parseStylesheet(document) as INode;

	const symbols: IDocumentSymbols = {
		document: documentPath,
		filepath: documentPath,
		...(await findDocumentSymbols(document, ast))
	};

	return {
		node: getNodeAtOffset(ast, offset),
		symbols
	};
}

async function findDocumentSymbols(document: TextDocument, ast: INode): Promise<IDocumentSymbols> {
	const symbols = ls.findDocumentSymbols(document, ast);
	const links = await findDocumentLinks(document, ast);

	const result: IDocumentSymbols = {
		functions: [],
		imports: convertLinksToImports(links),
		mixins: [],
		variables: []
	};

	for (const symbol of symbols) {
		const position = symbol.location.range.start;
		const offset = document.offsetAt(symbol.location.range.start);

		if (symbol.kind === SymbolKind.Variable) {
			result.variables.push({
				name: symbol.name,
				offset,
				position,
				value: getVariableValue(ast, offset)
			});
		} else if (symbol.kind === SymbolKind.Method) {
			result.mixins.push({
				name: symbol.name,
				offset,
				position,
				parameters: getMethodParameters(ast, offset)
			});
		} else if (symbol.kind === SymbolKind.Function) {
			result.functions.push({
				name: symbol.name,
				offset,
				position,
				parameters: getMethodParameters(ast, offset)
			});
		}
	}

	return result;
}

async function findDocumentLinks(document: TextDocument, ast: INode): Promise<DocumentLink[]> {
	const links = await ls.findDocumentLinks2(document, ast, buildDocumentContext(document.uri));
	const linksByRange = new Map(links.map(link => [getRangeKey(link), link]));

	// The language service drops or rewrites some targets, so the raw ones are needed.
	const rawLinks = ls.findDocumentLinks(document, ast, { resolveReference: ref => ref });
	const documentPath = URI.parse(document.uri).fsPath;

	const result: DocumentLink[] = [];

	for (const rawLink of rawLinks) {
		const packagePath = rawLink.target === undefined ? undefined : await resolvePackageImport(rawLink.target, documentPath);

		// The package blocks this import.
		if (packagePath === null) {
			continue;
		}

		if (packagePath !== undefined) {
			result.push({ ...rawLink, target: packagePath });

			continue;
		}

		const link = linksByRange.get(getRangeKey(rawLink));

		if (link?.target !== undefined && link.target !== '') {
			result.push({
				...link,
				target: URI.parse(link.target).fsPath
			});
		}
	}

	return result;
}

/**
 * Returns links only for imports that resolve through package exports.
 * Other imports are left to the editor. Embedded documents are not supported.
 */
export async function getPackageExportLinks(document: TextDocument): Promise<DocumentLink[]> {
	if (document.languageId !== 'scss') {
		return [];
	}

	const ast = ls.parseStylesheet(document) as INode;
	const rawLinks = ls.findDocumentLinks(document, ast, { resolveReference: ref => ref });
	const documentPath = URI.parse(document.uri).fsPath;

	const result: DocumentLink[] = [];

	for (const rawLink of rawLinks) {
		const packagePath = rawLink.target === undefined ? undefined : await resolvePackageImport(rawLink.target, documentPath);

		if (typeof packagePath === 'string') {
			result.push({ range: rawLink.range, target: URI.file(packagePath).toString() });
		}
	}

	return result;
}

function getRangeKey(link: DocumentLink): string {
	const { start, end } = link.range;

	return `${start.line}:${start.character}-${end.line}:${end.character}`;
}

function getVariableValue(ast: INode, offset: number): string | null {
	const node = getNodeAtOffset(ast, offset);

	if (node === null) {
		return null;
	}

	const parent = getParentNodeByType(node, NodeType.VariableDeclaration);

	return parent?.getValue()?.getText() || null;
}

function getMethodParameters(ast: INode, offset: number): IVariable[] {
	const node = getNodeAtOffset(ast, offset);

	if (node === null) {
		return [];
	}

	return node
		.getParameters()
		.getChildren()
		.map(child => {
			const defaultValueNode = child.getDefaultValue();

			const value = defaultValueNode === undefined ? null : defaultValueNode.getText();

			return {
				name: child.getName(),
				offset: child.offset,
				value
			};
		});
}

export function convertLinksToImports(links: DocumentLink[]): IImport[] {
	const result: IImport[] = [];

	for (const link of links) {
		if (link.target !== undefined) {
			result.push({
				filepath: link.target,
				dynamic: reDynamicPath.test(link.target),
				css: link.target.endsWith('.css')
			});
		}
	}

	return result;
}
