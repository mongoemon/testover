import { test, expect } from './support/evidence';
import { DEMO, TasksPage, signIn } from './support/pages';

test.describe('Task board', { tag: '@tasks' }, () => {
  let tasks: TasksPage;

  test.beforeEach(async ({ page }) => {
    tasks = new TasksPage(page);
    await signIn(page, DEMO);
  });

  test.describe('adding', () => {
    test('starts with an empty state and zero remaining', async () => {
      await expect(tasks.emptyMessage).toHaveText('No tasks yet. Add your first task above.');
      await expect(tasks.count).toHaveText('0 tasks left');
      await expect(tasks.clearCompletedButton).toBeDisabled();
    });

    test('adds a task with the default Medium priority', { tag: '@smoke' }, async () => {
      await tasks.add('Write QA report');

      await tasks.expectTitles(['Write QA report']);
      await expect(tasks.item('Write QA report').locator('.badge')).toHaveText('Medium');
      await expect(tasks.count).toHaveText('1 task left');
      await expect(tasks.emptyMessage).toBeHidden();
    });

    test('keeps the chosen priority for each task', async () => {
      await tasks.add('Quick win', 'Low');
      await tasks.add('Fire drill', 'High');

      await expect(tasks.item('Quick win').locator('.badge')).toHaveText('Low');
      await expect(tasks.item('Fire drill').locator('.badge')).toHaveText('High');
      await expect(tasks.item('Fire drill').locator('.badge')).toHaveAttribute('data-priority', 'high');
    });

    test('trims surrounding whitespace from the title', { tag: '@validation' }, async () => {
      await tasks.add('   Padded title   ');

      await tasks.expectTitles(['Padded title']);
    });

    test('submits with the Enter key and resets the form', { tag: '@a11y' }, async ({ page }) => {
      const input = page.getByLabel('New task', { exact: true });
      await input.fill('Enter key task');
      await input.press('Enter');

      await tasks.expectTitles(['Enter key task']);
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
    });

    for (const blank of ['', '    ']) {
      test(`rejects a blank title (${JSON.stringify(blank)})`, { tag: '@validation' }, async () => {
        await tasks.add(blank);

        await expect(tasks.alert).toHaveText('Task title is required');
        await tasks.expectTitles([]);
      });
    }

    test('rejects a title longer than 80 characters but accepts exactly 80', { tag: '@validation' }, async () => {
      await tasks.add('x'.repeat(81));
      await expect(tasks.alert).toHaveText('Task title must be 80 characters or fewer');
      await tasks.expectTitles([]);

      await tasks.add('y'.repeat(80));
      await expect(tasks.alert).toBeHidden();
      await tasks.expectTitles(['y'.repeat(80)]);
    });

    test('clears the validation error after a successful add', { tag: '@validation' }, async () => {
      await tasks.add('');
      await expect(tasks.alert).toBeVisible();

      await tasks.add('Fixed it');

      await expect(tasks.alert).toBeHidden();
    });

    test('renders special characters as text, not markup', { tag: '@security' }, async ({ page }) => {
      await tasks.add('<b>bold</b> & "quotes"');

      await tasks.expectTitles(['<b>bold</b> & "quotes"']);
      await expect(page.locator('ul b')).toHaveCount(0);
    });
  });

  test.describe('completing, editing, deleting', () => {
    test('completes and reopens a task, updating the remaining count', async () => {
      await tasks.add('Review PR');
      await tasks.add('Deploy');
      await expect(tasks.count).toHaveText('2 tasks left');

      await tasks.complete('Review PR');
      await expect(tasks.count).toHaveText('1 task left');
      await expect(tasks.item('Review PR')).toHaveClass(/done/);

      await tasks.reopen('Review PR');
      await expect(tasks.count).toHaveText('2 tasks left');
      await expect(tasks.item('Review PR')).not.toHaveClass(/done/);
    });

    test('edits a task title', async () => {
      await tasks.add('Draft plan');

      await tasks.rename('Draft plan', 'Final plan');

      await tasks.expectTitles(['Final plan']);
      await expect(tasks.alert).toBeHidden();
    });

    test('keeps the original title when an edit is cancelled', async ({ page }) => {
      await tasks.add('Original');
      await tasks.startEdit('Original');
      await page.getByLabel('Edit title', { exact: true }).fill('Changed my mind');

      await page.getByRole('button', { name: 'Cancel' }).click();

      await tasks.expectTitles(['Original']);
    });

    test('rejects an empty title while editing and stays in edit mode', { tag: '@validation' }, async ({ page }) => {
      await tasks.add('Keep me');
      await tasks.startEdit('Keep me');

      await tasks.saveEdit('   ');

      await expect(tasks.alert).toHaveText('Task title is required');
      await expect(page.getByLabel('Edit title', { exact: true })).toBeVisible();
    });

    test('deletes only the targeted task', async () => {
      await tasks.add('Keep A');
      await tasks.add('Remove me');
      await tasks.add('Keep B');

      await tasks.remove('Remove me');

      await tasks.expectTitles(['Keep A', 'Keep B']);
      await expect(tasks.count).toHaveText('2 tasks left');
    });

    test('returns to the empty state after the last task is deleted', async () => {
      await tasks.add('Only one');
      await tasks.remove('Only one');

      await expect(tasks.emptyMessage).toHaveText('No tasks yet. Add your first task above.');
    });
  });

  test.describe('filtering and searching', () => {
    test.beforeEach(async () => {
      await tasks.add('Buy milk');
      await tasks.add('Buy eggs');
      await tasks.add('Pay rent');
      await tasks.complete('Buy eggs');
    });

    test('shows everything by default and marks "All" as pressed', async () => {
      await tasks.expectTitles(['Buy milk', 'Buy eggs', 'Pay rent']);
      await expect(tasks.filterButton('All')).toHaveAttribute('aria-pressed', 'true');
    });

    test('filters to active tasks only', async () => {
      await tasks.filter('Active');

      await tasks.expectTitles(['Buy milk', 'Pay rent']);
      await expect(tasks.filterButton('Active')).toHaveAttribute('aria-pressed', 'true');
      await expect(tasks.filterButton('All')).toHaveAttribute('aria-pressed', 'false');
    });

    test('filters to completed tasks only', async () => {
      await tasks.filter('Completed');

      await tasks.expectTitles(['Buy eggs']);
    });

    test('keeps the overall remaining count while a filter is active', async () => {
      await tasks.filter('Completed');

      await expect(tasks.count).toHaveText('2 tasks left');
    });

    test('searches case-insensitively and restores the list when cleared', async () => {
      await tasks.search('BUY');
      await tasks.expectTitles(['Buy milk', 'Buy eggs']);

      await tasks.search('');
      await tasks.expectTitles(['Buy milk', 'Buy eggs', 'Pay rent']);
    });

    test('combines search with the status filter', async () => {
      await tasks.search('buy');
      await tasks.filter('Active');
      await tasks.expectTitles(['Buy milk']);

      await tasks.search('rent');
      await tasks.expectTitles(['Pay rent']);

      await tasks.filter('Completed');
      await tasks.expectTitles([]);
      await expect(tasks.emptyMessage).toHaveText('No matching tasks');
    });

    test('shows "No matching tasks" when a search finds nothing', async () => {
      await tasks.search('zzz');

      await expect(tasks.emptyMessage).toHaveText('No matching tasks');
    });
  });

  test.describe('clearing and persistence', () => {
    test('clears only completed tasks', async () => {
      await tasks.add('Done 1');
      await tasks.add('Open');
      await tasks.add('Done 2');
      await tasks.complete('Done 1');
      await tasks.complete('Done 2');
      await expect(tasks.clearCompletedButton).toBeEnabled();

      await tasks.clearCompleted();

      await tasks.expectTitles(['Open']);
      await expect(tasks.clearCompletedButton).toBeDisabled();
    });

    test('uses singular and plural wording for the remaining count', async () => {
      await tasks.add('One');
      await expect(tasks.count).toHaveText('1 task left');

      await tasks.add('Two');
      await expect(tasks.count).toHaveText('2 tasks left');
    });

    test('keeps tasks, completion state, and priority after a reload', { tag: '@persistence' }, async ({ page }) => {
      await tasks.add('Persist me', 'High');
      await tasks.add('Persist me too');
      await tasks.complete('Persist me too');

      await page.reload();

      await tasks.expectTitles(['Persist me', 'Persist me too']);
      await expect(tasks.item('Persist me').locator('.badge')).toHaveText('High');
      await expect(tasks.item('Persist me too').getByRole('checkbox')).toBeChecked();
      await expect(tasks.count).toHaveText('1 task left');
    });

    test('does not reuse the id of a deleted task after a reload', { tag: '@persistence' }, async ({ page }) => {
      await tasks.add('First');
      await tasks.add('Second');
      await tasks.remove('Second');
      await page.reload();

      await tasks.add('Third');
      await tasks.complete('Third');

      await tasks.expectTitles(['First', 'Third']);
      await expect(tasks.item('First').getByRole('checkbox')).not.toBeChecked();
      await expect(tasks.item('Third').getByRole('checkbox')).toBeChecked();
    });
  });
});
