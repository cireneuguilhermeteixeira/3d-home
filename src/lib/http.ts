export function failure(error:unknown) {
  const message=error instanceof Error?error.message:'Erro inesperado'
  const status=/não encontrado|Sessão/.test(message)?404:/Conflito/.test(message)?409:/não configurad|ausente/.test(message)?503:400
  return Response.json({error:message},{status})
}
