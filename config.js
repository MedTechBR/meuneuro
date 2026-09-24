// Configuração web do projeto Firebase PRÓPRIO do RefilMed (projeto refilmed, conta matheusparente1).
// Pública por design: quem protege os dados são as regras em firestore.rules.
// ativo: false mantém o app no modo local (demonstração) até o login estar ligado no console
// (Authentication > Anônimo e E-mail/senha). Depois é só trocar para true.
window.REFILMED_CONFIG = {
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
  sncr: { ambiente: 'homologacao', cnpj: '' }
};
