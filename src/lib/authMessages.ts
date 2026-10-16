/** Supabase Auth messages in the app's language; anything unknown falls back to a generic line. */
export function authMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme o seu e-mail antes de entrar. O link está na sua caixa de entrada.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta. Entre com a sua senha.';
  if (m.includes('different from the old') || m.includes('same password')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('password') && (m.includes('at least') || m.includes('short') || m.includes('length'))) return 'A senha não atende ao mínimo de caracteres.';
  if (m.includes('weak')) return 'Escolha uma senha mais forte.';
  if (m.includes('auth session missing') || m.includes('session')) return 'Sua sessão expirou. Entre de novo.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão. Verifique a internet e tente de novo.';
  return 'Não foi possível concluir. Tente de novo.';
}
