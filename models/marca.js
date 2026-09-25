const { Schema } = require('mongoose');

// Logo da empresa que usa o Help Desk (documento único "marca"). Fica no banco para
// funcionar em qualquer servidor, sem pasta de uploads. Imagens pequenas (até 512 KB).
const MarcaSchema = new Schema(
  {
    _id: { type: String, default: 'marca' },
    logo: { type: Buffer, default: null },
    // image/png | image/jpeg | image/webp
    tipo: { type: String, default: null },
    // muda a cada troca: vai na URL para o navegador não usar a logo antiga do cache
    versao: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

module.exports = MarcaSchema;
