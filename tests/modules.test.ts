import { describe, test, expect } from 'bun:test';
import { MODULES, getModule, getModuleNames, isModuleName } from '../src/modules';
import { findAction, getAvailableActions, resolveActionUrl, resolveModuleCommand } from '../src/modules';
import type { Workspace } from '../src/types/config';

    describe('module registry', () => {
    test('contains expected modules', () => {
        const names = getModuleNames();
        expect(names).toContain('product');
        expect(names).toContain('bug');
        expect(names).toContain('task');
        expect(names).toContain('story');
        expect(names).toContain('user');
        expect(names.length).toBe(19);
    });

    test('getModule returns module by name', () => {
        const mod = getModule('product');
        expect(mod).toBeDefined();
        expect(mod!.name).toBe('product');
        const listAction = findAction(mod!, 'list');
        expect(listAction).toBeDefined();
        expect(listAction!.path).toBe('/products');
    });

    test('getModule is case insensitive', () => {
        expect(getModule('Product')).toBeDefined();
        expect(getModule('BUG')).toBeDefined();
    });

    test('getModule returns undefined for unknown module', () => {
        expect(getModule('nonexistent')).toBeUndefined();
    });

    test('isModuleName identifies valid modules', () => {
        expect(isModuleName('product')).toBe(true);
        expect(isModuleName('unknown')).toBe(false);
    });

    test('bug module has correct actions', () => {
        const bug = getModule('bug')!;
        const actions = bug.actions.map((a) => a.name);
        expect(actions).toContain('resolve');
        expect(actions).toContain('close');
        expect(actions).toContain('activate');
    });

    test('task module has correct actions', () => {
        const task = getModule('task')!;
        const actions = task.actions.map((a) => a.name);
        expect(actions).toContain('start');
        expect(actions).toContain('finish');
        expect(actions).toContain('close');
        expect(actions).toContain('activate');
    });

    test('product module has list operation', () => {
        const product = getModule('product')!;
        const listAction = findAction(product, 'list');
        expect(listAction).toBeDefined();
        expect(listAction!.name).toBe('list');
    });

    test('product module supports modules action', () => {
        const product = getModule('product')!;
        const action = findAction(product, 'action', 'modules');
        expect(action).toBeDefined();
        expect(action!.method).toBe('get');
        expect(action!.apiVersion).toBe('v1');
        expect(action!.path).toBe('/modules');
        expect(action!.resultGetter).toBe('modules');
    });

    test('bug module has no top-level list', () => {
        const bug = getModule('bug')!;
        const listAction = findAction(bug, 'list');
        expect(listAction).toBeDefined();
        expect(listAction!.path).toBe('/{scope}/{scopeID}/bugs');
    });
});

describe('module resolver', () => {
    const workspace: Workspace = {
        id: 1,
        product: { id: 10, name: '产品1' },
        project: { id: 20, name: '项目1' },
        execution: { id: 30, name: '执行1' },
    };

    test('resolves detail path', () => {
        const mod = getModule('product')!;
        const getAction = findAction(mod, 'get')!;
        expect(resolveActionUrl(getAction, { productID: 1 })).toBe('/products/1');
    });

    test('resolves action path', () => {
        const mod = getModule('bug')!;
        const action = findAction(mod, 'action', 'resolve')!;
        expect(resolveActionUrl(action, { bugID: 5 })).toBe('/bugs/5/resolve');
    });

    test('throws for unknown action', () => {
        const mod = getModule('bug')!;
        expect(findAction(mod, 'action', 'nonexistent')).toBeUndefined();
    });

    test('getAvailableActions returns action names', () => {
        const mod = getModule('story')!;
        const actions = getAvailableActions(mod);
        expect(actions).toContain('change');
        expect(actions).toContain('close');
        expect(actions).toContain('activate');
    });

    test('supports positional id for update action', () => {
        const mod = getModule('product')!;
        const command = resolveModuleCommand(
            mod,
            'update',
            {},
            ['1', '--name=产品1'],
        );
        expect(command.id).toBe(1);
        expect(command.path).toBe('/products/1');
        expect(command.data).toMatchObject({ name: '产品1' });
        expect(command.data).not.toHaveProperty('acl');
    });

    test('resolves product module tree path from positional id', () => {
        const mod = getModule('product')!;
        const command = resolveModuleCommand(
            mod,
            'modules',
            {},
            ['1'],
        );

        expect(command.id).toBe(1);
        expect(command.path).toBe('/modules');
        expect(command.query).toEqual({
            id: 1,
            type: 'story',
        });
    });

    test('preserves object testcase steps from --data for hierarchical steps', () => {
        const mod = getModule('testcase')!;
        const steps = [
            { name: '1', type: 'step', desc: '主步骤', expect: '主步骤预期' },
            { name: '1.1', type: 'step', desc: '子步骤', expect: '' },
        ];
        const command = resolveModuleCommand(
            mod,
            'create',
            {
                data: JSON.stringify({
                    productID: 1,
                    title: '层级步骤验证',
                    steps,
                    expects: ['不使用 expects 生成层级步骤'],
                }),
            },
        );

        expect(command.data).toMatchObject({
            productID: 1,
            title: '层级步骤验证',
            expects: ['不使用 expects 生成层级步骤'],
        });
        expect((command.data as Record<string, unknown>).steps).toEqual(steps);
    });

    test('preserves object testcase steps from --data for update', () => {
        const mod = getModule('testcase')!;
        const steps = [
            { name: '1', type: 'step', desc: '主步骤', expect: '主步骤预期' },
            { name: '1.1', type: 'step', desc: '子步骤', expect: '' },
        ];
        const command = resolveModuleCommand(
            mod,
            'update',
            { data: JSON.stringify({ title: '层级步骤验证', steps }) },
            ['6'],
        );

        expect(command.id).toBe(6);
        expect(command.path).toBe('/testcases/6');
        expect((command.data as Record<string, unknown>).steps).toEqual(steps);
    });

    test('supports testcase create module field', () => {
        const mod = getModule('testcase')!;
        const command = resolveModuleCommand(
            mod,
            'create',
            {},
            ['--productID=1', '--title=模块用例', '--module=12'],
        );

        expect(command.path).toBe('/testcases');
        expect(command.data).toMatchObject({
            productID: 1,
            title: '模块用例',
            module: 12,
        });
    });

    test('supports testcase update module field', () => {
        const mod = getModule('testcase')!;
        const command = resolveModuleCommand(
            mod,
            'update',
            {},
            ['6', '--title=更新模块', '--module=34'],
        );

        expect(command.id).toBe(6);
        expect(command.path).toBe('/testcases/6');
        expect(command.data).toMatchObject({
            title: '更新模块',
            module: 34,
        });
        expect(command.data).not.toHaveProperty('moudule');
    });

    test('supports positional id for delete action', () => {
        const mod = getModule('product')!;
        const command = resolveModuleCommand(
            mod,
            'delete',
            {},
            ['1'],
        );
        expect(command.id).toBe(1);
        expect(command.path).toBe('/products/1');
    });
});
