export type PasswordCheckId = 'length' | 'common' | 'sequence' | 'repetition' | 'personal';

export interface PasswordCheck {
  id: PasswordCheckId;
  label: string;
  ok: boolean;
}

export interface PasswordVerdict {
  checks: PasswordCheck[];
  /** Every rule passed: the password is safe to submit */
  ok: boolean;
}

/** What the student typed elsewhere on the form, so the password cannot contain it */
export interface PasswordContext {
  email?: string;
  name?: string;
}

export const PASSWORD_MIN_LENGTH = 8;
/** Supabase hashes with bcrypt, which ignores anything past 72 bytes */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * The passwords most used in leaks (global and Brazilian), lowercase and without accents.
 * A password made of one of these plus trailing digits is treated as the same password.
 */
const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '1234567', '12345', '1234567890', '1234', '123123',
  '111111', '000000', '00000000', '007007', '007', '777777', '7777777', '222222', '333333',
  '444444', '555555', '666666', '888888', '88888888', '999999', '101010', '121212',
  '112233', '159753', '123321', '159357', '147258369', '369258147', '741852963',
  '789456123', '135790', '246810', '314159', '31415926', '112358', '102030',
  'password', 'password1', 'password123', 'passw0rd', 'senha', 'senha123', 'senha1234',
  'senha12345', 'minhasenha', 'senhasegura', '123mudar', 'mudar123',
  'qwerty', 'qwerty123', 'qwertyuiop', 'qwertz', 'azerty', 'abc123', 'abcd1234',
  'abc12345', 'a123456', 'ab123456', 'abcdef', 'asdfgh', 'asdfghjkl', 'asdf', 'zxcvbnm',
  'zxcvbn', 'qazwsx', 'q1w2e3r4', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', '1qazxsw2',
  'zaq12wsx', 'poiuyt', '123qwe',
  'admin', 'admin123', 'administrador', 'root', 'toor', 'guest', 'usuario', 'teste',
  'teste123', 'default', 'changeme', 'secret', 'master', 'shadow',
  'letmein', 'welcome', 'welcome1', 'iloveyou', 'iloveyou1', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'soccer', 'soccer1', 'whatever',
  'trustno1', 'superman', 'batman', 'pokemon', 'naruto', 'starwars', 'minecraft',
  'brasil', 'brasil123', 'brasileiro', 'flamengo', 'corinthians', 'palmeiras',
  'saopaulo', 'botafogo', 'cruzeiro', 'gremio', 'internacional', 'santos', 'vasco',
  'atletico', 'futebol', 'gol123', 'pele', 'neymar', 'messi', 'cr7', 'ronaldo',
  'maria', 'joao', 'jose', 'ana', 'amor', 'amor123', 'deus', 'banana', 'laranja',
  'melancia', 'michael', 'jordan', 'hunter', 'killer', 'chelsea', 'arsenal',
  'liverpool', 'barcelona', 'realmadrid', 'juventus',
  'vida', 'felicidade', 'casa123', 'familia', 'esperanca', 'saudade', 'sucesso',
  'dinheiro', 'trabalho',
  '987654', '987654321', '654321', '456789', '123654',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCommon(normalized: string): boolean {
  if (COMMON_PASSWORDS.has(normalized)) return true;
  const withoutTrailingDigits = normalized.replace(/\d+$/, '');
  return withoutTrailingDigits.length >= 4 && COMMON_PASSWORDS.has(withoutTrailingDigits);
}

type CharKind = 'digit' | 'letter' | 'other';

function charKind(char: string): CharKind {
  if (char >= '0' && char <= '9') return 'digit';
  if (char.toLowerCase() >= 'a' && char.toLowerCase() <= 'z') return 'letter';
  return 'other';
}

/** 1234, abcd, 9876, dcba: four or more steps of one, in either direction. */
function hasSequentialRun(value: string, run = 4): boolean {
  for (let start = 0; start + run <= value.length; start++) {
    const kind = charKind(value[start]);
    if (kind === 'other') continue;
    let sequential = true;
    for (let step = 1; step < run; step++) {
      const current = value.charCodeAt(start + step);
      const previous = value.charCodeAt(start + step - 1);
      if (charKind(value[start + step]) !== kind || Math.abs(current - previous) !== 1) {
        sequential = false;
        break;
      }
    }
    if (sequential) return true;
  }
  return false;
}

/** aaaa, 1111: the same character four or more times in a row. */
function hasRepetition(value: string, run = 4): boolean {
  let streak = 1;
  for (let i = 1; i < value.length; i++) {
    streak = value[i] === value[i - 1] ? streak + 1 : 1;
    if (streak >= run) return true;
  }
  return false;
}

function personalTokens(context: PasswordContext): string[] {
  const source = [context.name ?? '', context.email?.split('@')[0] ?? ''].join(' ');
  return normalize(source)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function hasPersonalWord(normalized: string, context: PasswordContext): boolean {
  const tokens = personalTokens(context);
  if (tokens.length === 0) return false;
  const stripped = normalized.replace(/[^a-z0-9]+/g, '');
  return tokens.some((token) => normalized.includes(token) || stripped.includes(token));
}

/** Scores the password against every rule; the checklist UI reads these same results. */
export function evaluatePassword(password: string, context: PasswordContext = {}): PasswordVerdict {
  const normalized = normalize(password);
  const checks: PasswordCheck[] = [
    {
      id: 'length',
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      id: 'common',
      label: 'Longe das senhas mais usadas',
      ok: !isCommon(normalized),
    },
    {
      id: 'sequence',
      label: 'Sem sequências como 1234 ou abcd',
      ok: !hasSequentialRun(normalized),
    },
    {
      id: 'repetition',
      label: 'Sem repetições como aaaa',
      ok: !hasRepetition(normalized),
    },
    {
      id: 'personal',
      label: 'Não usa seu nome nem seu e-mail',
      ok: !hasPersonalWord(normalized, context),
    },
  ];
  return { checks, ok: checks.every((check) => check.ok) };
}
