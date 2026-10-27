'use strict';

import * as assert from 'assert';
import * as path from 'path';

import { resolvePackageImport } from '../../utils/package';

const root = path.resolve(__dirname, '../../../../fixtures/unit/exports');
const modules = path.join(root, 'node_modules');
const fromFile = path.join(root, 'main.scss');

describe('Utils/Package', () => {
	describe('.resolvePackageImport', () => {
		it('should resolve a wildcard export of a scoped package', async () => {
			const actual = await resolvePackageImport('@scope/pkg/waitrose/web/spacing.scss', fromFile);

			assert.strictEqual(actual, path.join(modules, '@scope/pkg/dist/waitrose/web/spacing.scss'));
		});

		it('should resolve the `~` alias with exports', async () => {
			const actual = await resolvePackageImport('~@scope/pkg/waitrose/web/spacing.scss', fromFile);

			assert.strictEqual(actual, path.join(modules, '@scope/pkg/dist/waitrose/web/spacing.scss'));
		});

		it('should resolve exact exports for the package root and subpaths', async () => {
			assert.strictEqual(await resolvePackageImport('exact', fromFile), path.join(modules, 'exact/lib/index.scss'));
			assert.strictEqual(await resolvePackageImport('exact/colors', fromFile), path.join(modules, 'exact/lib/_colors.scss'));
		});

		it('should apply Sass partial and index resolution to export targets', async () => {
			assert.strictEqual(await resolvePackageImport('exact/button', fromFile), path.join(modules, 'exact/lib/_button.scss'));
			assert.strictEqual(await resolvePackageImport('exact/root', fromFile), path.join(modules, 'exact/_index.scss'));
		});

		it('should resolve nested and array conditional exports', async () => {
			assert.strictEqual(await resolvePackageImport('conditional', fromFile), path.join(modules, 'conditional/sass/index.scss'));
			assert.strictEqual(await resolvePackageImport('conditional/theme', fromFile), path.join(modules, 'conditional/sass/theme.scss'));
		});

		it('should apply Sass partial and index resolution to the target', async () => {
			const actual = await resolvePackageImport('@scope/pkg/waitrose/web/spacing', fromFile);

			assert.strictEqual(actual, path.join(modules, '@scope/pkg/dist/waitrose/web/spacing.scss'));
		});

		it('should block explicit null exports', async () => {
			assert.strictEqual(await resolvePackageImport('exact/hidden', fromFile), null);
			assert.strictEqual(await resolvePackageImport('null-exports/file.scss', fromFile), null);
		});

		it('should block paths that are not exported', async () => {
			assert.strictEqual(await resolvePackageImport('blocked/private.scss', fromFile), null);
			assert.strictEqual(await resolvePackageImport('exact/lib/hidden.scss', fromFile), null);
		});

		it('should block missing targets', async () => {
			assert.strictEqual(await resolvePackageImport('blocked/missing', fromFile), null);
			assert.strictEqual(await resolvePackageImport('@scope/pkg/unknown.scss', fromFile), null);
		});

		it('should not resolve packages without exports', async () => {
			assert.strictEqual(await resolvePackageImport('legacy/lib', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('~legacy/lib', fromFile), undefined);
		});

		it('should not resolve relative, absolute, url and unknown package imports', async () => {
			assert.strictEqual(await resolvePackageImport('./exact', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('../exact', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('/exact', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('sass:math', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('https://example.com/a.css', fromFile), undefined);
			assert.strictEqual(await resolvePackageImport('unknown-package/a', fromFile), undefined);
		});
	});
});
