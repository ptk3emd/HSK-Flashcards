import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePassword, PasswordCheckId, PasswordContext } from './passwordPolicy';

const rule = (password: string, id: PasswordCheckId, context: PasswordContext = {}) =>
  evaluatePassword(password, context).checks.find((check) => check.id === id)!.ok;

test('short passwords fail the length rule', () => {
  assert.equal(rule('Curta-9', 'length'), false);
  assert.equal(rule('Curta-99', 'length'), true);
});

test('passwords beyond the bcrypt limit are refused', () => {
  assert.equal(rule('a'.repeat(73), 'length'), false);
});

test('the most-used passwords are blocked, digits or accents aside', () => {
  assert.equal(rule('12345678', 'common'), false);
  assert.equal(rule('SENHA123', 'common'), false);
  assert.equal(rule('senha12345', 'common'), false);
  assert.equal(rule('pelé2026', 'common'), false);
  assert.equal(rule('Tigre-Vermelho-1974', 'common'), true);
});

test('sequential runs are refused in both directions', () => {
  assert.equal(rule('abcd1234', 'sequence'), false);
  assert.equal(rule('Sono-4321', 'sequence'), false);
  assert.equal(rule('Forte-Casa-9', 'sequence'), true);
});

test('repeated characters are refused', () => {
  assert.equal(rule('aaaa-bbbb', 'repetition'), false);
  assert.equal(rule('Forte-Casa-9', 'repetition'), true);
});

test('the password cannot contain the name or the e-mail', () => {
  const context = { name: 'Marina Silva', email: 'marina@exemplo.com' };
  assert.equal(rule('Marina-Forte-22', 'personal', context), false);
  assert.equal(rule('silva-forte-22', 'personal', context), false);
  assert.equal(rule('Tigre-Forte-22', 'personal', context), true);
});

test('name pieces shorter than three letters are ignored', () => {
  assert.equal(rule('Valente-77-x', 'personal', { name: 'Al' }), true);
});

test('a strong password passes every rule', () => {
  const verdict = evaluatePassword('TigreVermelho-1974', { name: 'Marina Silva', email: 'marina@exemplo.com' });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checks.length, 5);
  assert.equal(verdict.checks.every((check) => check.ok), true);
});
