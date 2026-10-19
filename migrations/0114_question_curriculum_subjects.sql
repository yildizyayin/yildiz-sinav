-- ANUNEX subject identifiers, not fabricated official outcome codes.
-- Keep any existing subject identity, activity state and downstream references.
INSERT OR IGNORE INTO subjects(id,code,name,category) VALUES
 ('sub_edb','EDB','Türk Dili ve Edebiyatı','VERBAL'),
 ('sub_fiz','FIZ','Fizik','NUMERIC'),
 ('sub_kim','KIM','Kimya','NUMERIC'),
 ('sub_biy','BIY','Biyoloji','NUMERIC'),
 ('sub_tar','TAR','Tarih','VERBAL'),
 ('sub_cog','COG','Coğrafya','VERBAL'),
 ('sub_fel','FEL','Felsefe','VERBAL'),
 ('sub_ing','ING','İngilizce','VERBAL');
