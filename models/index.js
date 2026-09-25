const mongoose = require('mongoose');

// consultas não filtram por campos fora do schema
mongoose.set('strictQuery', true);

const UsuarioSchema = require('./usuario');
const CategoriaSchema = require('./categoria');
const ChamadoSchema = require('./chamado');
const InteracaoSchema = require('./interacao');
const ContadorSchema = require('./contador');
const EquipeSchema = require('./equipe');
const ServicoSchema = require('./servico');
const EmpresaSchema = require('./empresa');
const TagSchema = require('./tag');
const JustificativaSchema = require('./justificativa');
const FeriadoSchema = require('./feriado');
const MacroSchema = require('./macro');
const ConfiguracaoSchema = require('./configuracao');
const PerfilSchema = require('./perfil');
const CargoSchema = require('./cargo');
const ClassificacaoSchema = require('./classificacao');
const CampoAdicionalSchema = require('./campo-adicional');
const RegraExibicaoSchema = require('./regra-exibicao');
const AvisoSchema = require('./aviso');
const NotificacaoSchema = require('./notificacao');
const ConfiguracaoEmailSchema = require('./configuracao-email');
const EmailRecebidoSchema = require('./email-recebido');
const MarcaSchema = require('./marca');
const { codigoSequencial, preencheCodigos } = require('./plugins/codigo');

// cadastros com "Id" numérico nas listas do painel (antes de compilar os models)
const COM_CODIGO = {
  Usuario: UsuarioSchema,
  Categoria: CategoriaSchema,
  Equipe: EquipeSchema,
  Servico: ServicoSchema,
  Empresa: EmpresaSchema,
  Tag: TagSchema,
  Justificativa: JustificativaSchema,
  Feriado: FeriadoSchema,
  Macro: MacroSchema,
  Perfil: PerfilSchema,
  Cargo: CargoSchema,
  Classificacao: ClassificacaoSchema,
  CampoAdicional: CampoAdicionalSchema,
  RegraExibicao: RegraExibicaoSchema,
  Aviso: AvisoSchema,
};
Object.values(COM_CODIGO).forEach((schema) => schema.plugin(codigoSequencial));

const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Chamado = mongoose.model('Chamado', ChamadoSchema);
const Interacao = mongoose.model('Interacao', InteracaoSchema);
const Contador = mongoose.model('Contador', ContadorSchema);
const Equipe = mongoose.model('Equipe', EquipeSchema);
const Servico = mongoose.model('Servico', ServicoSchema);
const Empresa = mongoose.model('Empresa', EmpresaSchema);
const Tag = mongoose.model('Tag', TagSchema);
const Justificativa = mongoose.model('Justificativa', JustificativaSchema);
const Feriado = mongoose.model('Feriado', FeriadoSchema);
const Macro = mongoose.model('Macro', MacroSchema);
const Configuracao = mongoose.model('Configuracao', ConfiguracaoSchema, 'configuracoes');
const Perfil = mongoose.model('Perfil', PerfilSchema, 'perfis');
const Cargo = mongoose.model('Cargo', CargoSchema);
const Classificacao = mongoose.model('Classificacao', ClassificacaoSchema, 'classificacoes');
const CampoAdicional = mongoose.model('CampoAdicional', CampoAdicionalSchema, 'camposadicionais');
const RegraExibicao = mongoose.model('RegraExibicao', RegraExibicaoSchema, 'regrasexibicao');
const Aviso = mongoose.model('Aviso', AvisoSchema);
const Notificacao = mongoose.model('Notificacao', NotificacaoSchema, 'notificacoes');
const ConfiguracaoEmail = mongoose.model(
  'ConfiguracaoEmail',
  ConfiguracaoEmailSchema,
  'configuracoesdeemail',
);
const EmailRecebido = mongoose.model('EmailRecebido', EmailRecebidoSchema, 'emailsrecebidos');
const Marca = mongoose.model('Marca', MarcaSchema, 'marcas');

// nomes usados pelos scripts de índices e pelo seed
const NOMES_DOS_MODELS = [
  'Usuario',
  'Categoria',
  'Chamado',
  'Interacao',
  'Contador',
  'Equipe',
  'Servico',
  'Empresa',
  'Tag',
  'Justificativa',
  'Feriado',
  'Macro',
  'Configuracao',
  'Perfil',
  'Cargo',
  'Classificacao',
  'CampoAdicional',
  'RegraExibicao',
  'Aviso',
  'Notificacao',
  'ConfiguracaoEmail',
  'EmailRecebido',
  'Marca',
];

/**
 * Dá o Id numérico aos cadastros que ainda não têm (bancos antigos e registros do seed).
 * @returns {Promise<number>}
 */
const preencheCodigosDosCadastros = async () => {
  let total = 0;
  for (const nome of Object.keys(COM_CODIGO)) total += await preencheCodigos(mongoose.model(nome));
  return total;
};

const connect = async () => {
  await mongoose.connect(process.env.MONGO_URL);
};

const disconnect = () => mongoose.disconnect();

module.exports = {
  connect,
  disconnect,
  NOMES_DOS_MODELS,
  preencheCodigosDosCadastros,
  Usuario,
  Categoria,
  Chamado,
  Interacao,
  Contador,
  Equipe,
  Servico,
  Empresa,
  Tag,
  Justificativa,
  Feriado,
  Macro,
  Configuracao,
  Perfil,
  Cargo,
  Classificacao,
  CampoAdicional,
  RegraExibicao,
  Aviso,
  Notificacao,
  ConfiguracaoEmail,
  EmailRecebido,
  Marca,
};
