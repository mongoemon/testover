import { expect, type Locator, type Page } from '@playwright/test';

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export interface Account extends Credentials {
  readonly displayName: string;
}

/** Seeded by the app on first load. */
export const DEMO: Account = { username: 'demo', password: 'demo1234', displayName: 'Demo User' };

/** A fresh account used for registration journeys (each test gets an empty browser context). */
export const ALICE: Account = { username: 'alice', password: 's3cretpass', displayName: 'Alice Tester' };

export type Priority = 'Low' | 'Medium' | 'High';
export type TaskFilter = 'All' | 'Active' | 'Completed';

export class AuthPage {
  constructor(private readonly page: Page) {}

  get alert(): Locator {
    return this.page.getByRole('alert');
  }

  get status(): Locator {
    return this.page.getByRole('status');
  }

  async gotoLogin(): Promise<void> {
    await this.page.goto('/#/login');
  }

  async gotoRegister(): Promise<void> {
    await this.page.goto('/#/register');
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.getByLabel('Username', { exact: true }).fill(username);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async register(account: Account, confirmPassword: string = account.password): Promise<void> {
    await this.page.getByLabel('Username', { exact: true }).fill(account.username);
    await this.page.getByLabel('Display name', { exact: true }).fill(account.displayName);
    await this.page.getByLabel('Password', { exact: true }).fill(account.password);
    await this.page.getByLabel('Confirm password', { exact: true }).fill(confirmPassword);
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }

  async logout(): Promise<void> {
    await this.page.getByRole('button', { name: 'Logout' }).click();
  }
}

export class TasksPage {
  readonly list: Locator;
  readonly count: Locator;
  readonly emptyMessage: Locator;
  readonly alert: Locator;

  constructor(private readonly page: Page) {
    this.list = page.getByTestId('task-list');
    this.count = page.locator('#task-count');
    this.emptyMessage = page.locator('#task-empty');
    this.alert = page.getByRole('alert');
  }

  item(title: string): Locator {
    return this.list.getByRole('listitem').filter({ has: this.page.getByText(title, { exact: true }) });
  }

  async add(title: string, priority?: Priority): Promise<void> {
    await this.page.getByLabel('New task', { exact: true }).fill(title);
    if (priority) await this.page.getByLabel('Priority', { exact: true }).selectOption({ label: priority });
    await this.page.getByRole('button', { name: 'Add task' }).click();
  }

  async complete(title: string): Promise<void> {
    await this.item(title).getByRole('checkbox').check();
  }

  async reopen(title: string): Promise<void> {
    await this.item(title).getByRole('checkbox').uncheck();
  }

  async remove(title: string): Promise<void> {
    await this.item(title).getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  }

  async startEdit(title: string): Promise<void> {
    await this.item(title).getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  }

  async saveEdit(newTitle: string): Promise<void> {
    await this.page.getByLabel('Edit title', { exact: true }).fill(newTitle);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async rename(title: string, newTitle: string): Promise<void> {
    await this.startEdit(title);
    await this.saveEdit(newTitle);
  }

  async filter(name: TaskFilter): Promise<void> {
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  filterButton(name: TaskFilter): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async search(query: string): Promise<void> {
    await this.page.getByLabel('Search tasks', { exact: true }).fill(query);
  }

  async clearCompleted(): Promise<void> {
    await this.page.getByRole('button', { name: 'Clear completed' }).click();
  }

  get clearCompletedButton(): Locator {
    return this.page.getByRole('button', { name: 'Clear completed' });
  }

  async expectTitles(titles: readonly string[]): Promise<void> {
    await expect(this.list.locator('.task-title')).toHaveText([...titles]);
  }
}

export class ProfilePage {
  constructor(private readonly page: Page) {}

  get alert(): Locator {
    return this.page.getByRole('alert');
  }

  get status(): Locator {
    return this.page.getByRole('status');
  }

  async open(): Promise<void> {
    await this.page.getByRole('link', { name: 'Profile' }).click();
    await expect(this.page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  }

  async saveDisplayName(name: string): Promise<void> {
    await this.page.getByLabel('Display name', { exact: true }).fill(name);
    await this.page.getByRole('button', { name: 'Save profile' }).click();
  }

  async changePassword(current: string, next: string, confirm: string = next): Promise<void> {
    await this.page.getByLabel('Current password', { exact: true }).fill(current);
    await this.page.getByLabel('New password', { exact: true }).fill(next);
    await this.page.getByLabel('Confirm new password', { exact: true }).fill(confirm);
    await this.page.getByRole('button', { name: 'Change password' }).click();
  }

  get darkMode(): Locator {
    return this.page.getByLabel('Dark mode');
  }

  /** Clicks "Delete account", answers the confirm() dialog, and returns the dialog message. */
  async deleteAccount(accept: boolean): Promise<string> {
    let message = '';
    this.page.once('dialog', async (dialog) => {
      message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    await this.page.getByRole('button', { name: 'Delete account' }).click();
    return message;
  }
}

export async function signIn(page: Page, credentials: Credentials): Promise<void> {
  const auth = new AuthPage(page);
  await auth.gotoLogin();
  await auth.login(credentials.username, credentials.password);
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
}
