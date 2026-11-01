// Configuração web do projeto Firebase PRÓPRIO do Meu Neuro (o id "refilmed" é do projeto e não muda; conta matheusparente1).
// Pública por design: quem protege os dados são as regras em firestore.rules.
// ativo: false mantém o app no modo local (demonstração) até o login estar ligado no console
// (Authentication > Anônimo e E-mail/senha). Depois é só trocar para true.
window.MEUNEURO_CONFIG = {
  ativo: false,
  apiKey: 'AIzaSyAvgWtke3ZSMKqsXY9p6Q5Sm3Nqn3dFhkA',
  authDomain: 'refilmed.firebaseapp.com',
  projectId: 'refilmed',
  storageBucket: 'refilmed.firebasestorage.app',
  messagingSenderId: '1087573634828',
  appId: '1:1087573634828:web:5745152aa0eee12706a329',
  regiaoFunctions: 'southamerica-east1',
  // SNCR da Anvisa: 'homologacao' para testes; 'producao' quando a empresa estiver pronta.
  // cnpj: CNPJ da empresa responsável pela plataforma (obrigatório para numeração de controle especial).
  sncr: { ambiente: 'homologacao', cnpj: '69544873000161' },
  empresa: { razao: 'M PARENTE OLIVEIRA TECNOLOGIA LTDA', fantasia: 'MedTech', cnpj: '69.544.873/0001-61', endereco: 'R. Visconde de Mauá, 3111, Dionísio Torres, Fortaleza-CE' },
  // Diretor técnico médico (Lei 14.510/2022; Res. CFM 2.314/2022): aparece no rodapé quando preenchido.
  responsavelTecnico: { nome: '', crm: '', uf: '' }
};
