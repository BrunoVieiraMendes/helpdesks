const { Schema } = require('mongoose');

// Sequências atômicas. _id é o nome da sequência (ex.: 'chamado').
const ContadorSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

module.exports = ContadorSchema;
