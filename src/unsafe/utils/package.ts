'use strict';

import * as path from 'path';

import { readFile, statFile } from './fs';

type Target = string | null | undefined | Target[] | { [key: string]: Target };

const conditions = new Set(['sass', 'style', 'default']);
const rePackageName = /^(?:@[\w~-][\w.~-]*\/)?[\w~-][\w.~-]*$/;
const reScheme = /^[a-z][a-z\d+.-]*:/i;

/**
 * Resolves an import of a package that declares `exports` in its package.json.
 *
 * Returns `undefined` when the import is not handled here (relative paths, URLs,
 * unknown packages and packages without `exports`), `null` when the import is
 * blocked or the target is missing, and the file path otherwise.
 */
export async function resolvePackageImport(specifier: string, fromFile: string): Promise<string | null | undefined> {
	if (specifier.startsWith('~') && specifier[1] !== '/') {
		specifier = specifier.slice(1);
	}

	if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/') || reScheme.test(specifier)) {
		return undefined;
	}

	const segments = specifier.split('/');
	const nameLength = specifier.startsWith('@') ? 2 : 1;
	const name = segments.slice(0, nameLength).join('/');

	if (!rePackageName.test(name)) {
		return undefined;
	}

	const found = await findPackage(name, path.dirname(fromFile));

	if (found === undefined || !Object.prototype.hasOwnProperty.call(found.manifest, 'exports')) {
		return undefined;
	}
	if (found.manifest.exports === null) {
		return null;
	}

	const subpath = '.' + segments.slice(nameLength).map(segment => '/' + segment).join('');
	const target = resolveExports(found.manifest.exports, subpath);

	if (typeof target !== 'string') {
		return null;
	}

	const filepath = path.resolve(found.directory, target);

	if (!isInside(found.directory, filepath)) {
		return null;
	}

	return (await findFile(filepath)) ?? null;
}

async function findPackage(name: string, directory: string): Promise<{ directory: string; manifest: { exports?: Target } } | undefined> {
	for (let current = directory; ; current = path.dirname(current)) {
		const packageDirectory = path.join(current, 'node_modules', name);

		try {
			const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'package.json')));

			if (manifest !== null && typeof manifest === 'object') {
				return { directory: packageDirectory, manifest };
			}
		} catch {
			// Not found or invalid, try the parent directory.
		}

		if (path.dirname(current) === current) {
			return undefined;
		}
	}
}

function resolveExports(exports: Target, subpath: string): string | null {
	const isSubpathMap = typeof exports === 'object' && exports !== null && !Array.isArray(exports) &&
		Object.keys(exports).some(key => key.startsWith('.'));

	if (!isSubpathMap) {
		return subpath === '.' ? resolveTarget(exports, '') ?? null : null;
	}

	const map = exports as { [key: string]: Target };

	if (Object.keys(map).some(key => !key.startsWith('.'))) {
		return null;
	}

	if (!subpath.includes('*') && Object.prototype.hasOwnProperty.call(map, subpath)) {
		return resolveTarget(map[subpath], '') ?? null;
	}

	let bestKey: string | undefined;
	let bestMatch = '';

	for (const key of Object.keys(map)) {
		const star = key.indexOf('*');

		if (star === -1 || star !== key.lastIndexOf('*')) {
			continue;
		}

		const prefix = key.slice(0, star);
		const suffix = key.slice(star + 1);

		if (subpath.length < key.length || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) {
			continue;
		}

		if (bestKey === undefined || prefix.length > bestKey.indexOf('*')) {
			bestKey = key;
			bestMatch = subpath.slice(prefix.length, subpath.length - suffix.length);
		}
	}

	return bestKey === undefined ? null : resolveTarget(map[bestKey], bestMatch) ?? null;
}

function resolveTarget(target: Target, match: string): string | null | undefined {
	if (typeof target === 'string') {
		if (!target.startsWith('./') || target.slice(2).split('/').some(segment => segment === '..' || segment === 'node_modules')) {
			return null;
		}

		return target.replace(/\*/g, match);
	}

	if (Array.isArray(target)) {
		for (const item of target) {
			const result = resolveTarget(item, match);

			if (typeof result === 'string') {
				return result;
			}
		}

		return null;
	}

	if (typeof target === 'object' && target !== null) {
		for (const key of Object.keys(target)) {
			if (!conditions.has(key)) {
				continue;
			}

			const result = resolveTarget(target[key], match);

			if (result !== undefined) {
				return result;
			}
		}

		return undefined;
	}

	return target === null ? null : undefined;
}

function isInside(directory: string, filepath: string): boolean {
	const relative = path.relative(directory, filepath);

	return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

async function isFile(filepath: string): Promise<boolean> {
	try {
		return (await statFile(filepath)).isFile();
	} catch {
		return false;
	}
}

/**
 * Applies the Sass rules for extensions, partials and index files.
 */
async function findFile(filepath: string): Promise<string | undefined> {
	const dirname = path.dirname(filepath);
	const basename = path.basename(filepath);

	const candidates = [filepath];

	if (!basename.endsWith('.scss') && !basename.endsWith('.css')) {
		candidates.push(
			filepath + '.scss',
			path.join(dirname, '_' + basename + '.scss'),
			path.join(filepath, 'index.scss'),
			path.join(filepath, '_index.scss'),
			filepath + '.css'
		);
	} else if (!basename.startsWith('_')) {
		candidates.push(path.join(dirname, '_' + basename));
	}

	for (const candidate of candidates) {
		if (await isFile(candidate)) {
			return candidate;
		}
	}

	return undefined;
}
