'use strict';
// 75 referencias: 15 distintas por letra, sin casilla libre.
// Todas son referencias de un único versículo de la Biblia.
const groups = {
  B: [
    ['Salmos 23:1','psalms',23,1],['Juan 3:16','john',3,16],['Filipenses 4:13','philippians',4,13],
    ['Josué 1:9','joshua',1,9],['Isaías 41:10','isaiah',41,10],['Salmos 46:1','psalms',46,1],
    ['Proverbios 3:5','proverbs',3,5],['Mateo 5:14','matthew',5,14],['Jeremías 29:11','jeremiah',29,11],
    ['Romanos 8:28','romans',8,28],['Apocalipsis 22:12','revelation',22,12],['Mateo 6:33','matthew',6,33],
    ['Juan 14:6','john',14,6],['Salmos 119:105','psalms',119,105],['Génesis 1:1','genesis',1,1]
  ],
  I: [
    ['Romanos 12:2','romans',12,2],['Juan 8:12','john',8,12],['Mateo 11:28','matthew',11,28],
    ['Hebreos 11:1','hebrews',11,1],['1 Corintios 13:4','1-corinthians',13,4],['Salmos 91:1','psalms',91,1],
    ['Efesios 6:11','ephesians',6,11],['Apocalipsis 21:4','revelation',21,4],['Juan 14:1','john',14,1],
    ['Apocalipsis 3:20','revelation',3,20],['Salmos 37:4','psalms',37,4],['Romanos 5:8','romans',5,8],
    ['Gálatas 5:22','galatians',5,22],['Santiago 1:5','james',1,5],['1 Juan 4:8','1-john',4,8]
  ],
  N: [
    ['Juan 1:1','john',1,1],['Salmos 27:1','psalms',27,1],['Isaías 40:31','isaiah',40,31],
    ['2 Corintios 5:17','2-corinthians',5,17],['Efesios 2:8','ephesians',2,8],['Mateo 28:19','matthew',28,19],
    ['Lucas 19:10','luke',19,10],['Salmos 121:1','psalms',121,1],['Jeremías 33:3','jeremiah',33,3],
    ['Daniel 6:22','daniel',6,22],['1 Pedro 5:7','1-peter',5,7],['Marcos 10:27','mark',10,27],
    ['Lucas 6:31','luke',6,31],['Filipenses 4:6','philippians',4,6],['Proverbios 16:3','proverbs',16,3]
  ],
  G: [
    ['1 Corintios 10:13','1-corinthians',10,13],['Juan 15:5','john',15,5],['Salmos 34:8','psalms',34,8],
    ['Salmos 100:5','psalms',100,5],['Isaías 26:3','isaiah',26,3],['Mateo 7:7','matthew',7,7],
    ['Deuteronomio 31:6','deuteronomy',31,6],['Juan 11:35','john',11,35],['Romanos 6:23','romans',6,23],
    ['Colosenses 3:23','colossians',3,23],['1 Tesalonicenses 5:17','1-thessalonians',5,17],
    ['Éxodo 20:12','exodus',20,12],['Proverbios 22:6','proverbs',22,6],
    ['Lucas 1:37','luke',1,37],['Hebreos 13:8','hebrews',13,8]
  ],
  O: [
    ['Mateo 22:37','matthew',22,37],['Juan 13:34','john',13,34],['1 Juan 1:9','1-john',1,9],
    ['Salmos 139:14','psalms',139,14],['Juan 10:11','john',10,11],['Proverbios 4:23','proverbs',4,23],
    ['Colosenses 3:2','colossians',3,2],['Romanos 15:13','romans',15,13],['Salmos 19:1','psalms',19,1],
    ['Santiago 4:7','james',4,7],['Efesios 4:32','ephesians',4,32],['Gálatas 6:9','galatians',6,9],
    ['2 Timoteo 1:7','2-timothy',1,7],['Miqueas 6:8','micah',6,8],['Apocalipsis 14:12','revelation',14,12]
  ]
};
const LETTERS = Object.keys(groups);
const VERSES = LETTERS.flatMap(col => groups[col].map((v,index) => ({
  id:col + String(index+1).padStart(2,'0'), col, ref:v[0], slug:v[1], chapter:v[2], verse:v[3]
})));
const VERSE_BY_ID = Object.fromEntries(VERSES.map(v=>[v.id,v]));
if (VERSES.length !== 75 || new Set(VERSES.map(v=>v.ref)).size !== 75) throw new Error('El banco debe tener 75 referencias únicas.');
module.exports = { LETTERS,VERSES,VERSE_BY_ID };
