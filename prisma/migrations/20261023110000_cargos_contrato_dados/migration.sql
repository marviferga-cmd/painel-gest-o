-- Cargos do contrato (tabela de serviços, CBO, equipe mínima e salário-base).
-- Reexecutável: atualiza o cargo se já existir o mesmo nome + nível.
INSERT INTO "cargos" ("nome", "nivel", "servico", "cbo", "equipe_minima", "salario_base", "ativo", "updated_at") VALUES
  ('Analista de atendimento de 1º nível – atendimento externo', '1º nível', 'Atendimento de 1º nível – Service Desk', '3172-10', 3, 2635.76, true, CURRENT_TIMESTAMP),
  ('Analista de atendimento de 1º nível – atendimento interno', '1º nível', 'Atendimento de 1º nível – Service Desk', '3172-10', 10, 2635.76, true, CURRENT_TIMESTAMP),
  ('Analista de 2º nível – Controle de Acessos', '2º nível', 'Atendimento de 2º nível – Controle de Acessos', '2124-20', 3, 5816.46, true, CURRENT_TIMESTAMP),
  ('Analista de 2º nível – Microinformática', '2º nível', 'Atendimento de 2º nível – Microinformática', '2124-20', 5, 4748.59, true, CURRENT_TIMESTAMP),
  ('Especialista de 2º nível – Microinformática (Gabinetes)', '2º nível', 'Atendimento de 2º nível – Microinformática (Gabinetes)', '2124-20', 6, 6645.01, true, CURRENT_TIMESTAMP),
  ('Analista de 2º nível – Sistemas', '2º nível', 'Atendimento de 2º nível – Sistemas', '2124-20', 2, 5533.90, true, CURRENT_TIMESTAMP),
  ('Supervisor de 1º nível', 'Supervisão', 'Gestão do Suporte Técnico', '4201-35', 2, 6409.85, true, CURRENT_TIMESTAMP),
  ('Supervisor de 2º nível (acessos, microinformática, gabinetes e sistemas)', 'Supervisão', 'Gestão do Suporte Técnico', '4201-35', 1, 7025.23, true, CURRENT_TIMESTAMP),
  ('Supervisor de documentação', 'Supervisão', 'Gestão do Suporte Técnico', '4201-35', 1, 7025.23, true, CURRENT_TIMESTAMP),
  ('Supervisor de manutenção de ativos de hardware de microinformática', 'Supervisão', 'Gestão do Suporte Técnico', '3132-20', 1, 4899.33, true, CURRENT_TIMESTAMP),
  ('Supervisor de suporte tecnológico aos serviços de microinformática', 'Supervisão', 'Gestão do Suporte Técnico', '2124-20', 1, 7808.83, true, CURRENT_TIMESTAMP),
  ('Supervisor de logística para os ativos de hardware de microinformática', 'Supervisão', 'Gestão do Suporte Técnico', '4141-40', 1, 4920.77, true, CURRENT_TIMESTAMP),
  ('Gerente de serviços', 'Gerência', 'Gestão do Suporte Técnico', '1425-30', 2, 12337.72, true, CURRENT_TIMESTAMP),
  ('Técnico de manutenção de ativos de hardware de microinformática', 'Técnico', 'Manutenção especializada em ativos de hardware de microinformática', '3132-20', 2, 2797.76, true, CURRENT_TIMESTAMP),
  ('Analista de suporte tecnológico aos serviços de microinformática', '3º nível', 'Suporte tecnológico aos serviços de microinformática', '2124-20', 2, 5553.96, true, CURRENT_TIMESTAMP),
  ('Técnico de logística para os ativos de hardware de microinformática', 'Técnico', 'Logística para os ativos de hardware de microinformática', '4141-40', 1, 2796.56, true, CURRENT_TIMESTAMP),
  ('Analista de suporte técnico em telefonia', 'Analista', 'Manutenção especializada em ativos de telefonia', '2124-20', 3, 4495.44, true, CURRENT_TIMESTAMP),
  ('Atendente da Ouvidoria', 'Atendimento', 'Atendimento da Ouvidoria (manifestações e informações processuais)', '4223-05', 10, 2826.14, true, CURRENT_TIMESTAMP),
  ('Supervisor da Ouvidoria', 'Supervisão', 'Atendimento da Ouvidoria (manifestações e informações processuais)', '4201-35', 2, 5105.44, true, CURRENT_TIMESTAMP)
ON CONFLICT ("nome", "nivel") DO UPDATE SET
  "servico" = EXCLUDED."servico",
  "cbo" = EXCLUDED."cbo",
  "equipe_minima" = EXCLUDED."equipe_minima",
  "salario_base" = EXCLUDED."salario_base",
  "updated_at" = CURRENT_TIMESTAMP;
