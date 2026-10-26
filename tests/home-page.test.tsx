// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home page', () => {
  it('shows the password login screen when no session exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    render(<HomePage />);

    expect(await screen.findByLabelText('账号')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录工作区' })).toBeTruthy();
  });
});
