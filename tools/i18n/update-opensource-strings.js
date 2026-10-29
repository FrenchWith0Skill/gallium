// Passage en open source : ajoute les nouveaux textes (licence GPL, code source, dons) aux 19 langues
// et retire l'ancien texte de soutien « payer le montant que tu veux ».
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'locales');
const OLD = "Gallium est gratuit. S'il t'est utile, tu peux soutenir son développement en payant le montant que tu veux.";
const K = [
  'Code source sur GitHub',
  "Gallium est gratuit et open source. S'il t'est utile, tu peux soutenir son développement avec un don.",
  "Gallium est un logiciel libre sous licence GPL-3.0 : tu peux l'utiliser, l'étudier, le modifier et le redistribuer librement.",
  'Licence',
];
const T = {
  en: ['Source code on GitHub', 'Gallium is free and open source. If it helps you, you can support its development with a donation.', 'Gallium is free software under the GPL-3.0 license: you can use, study, modify and redistribute it freely.', 'License'],
  es: ['Código fuente en GitHub', 'Gallium es gratis y de código abierto. Si te resulta útil, puedes apoyar su desarrollo con una donación.', 'Gallium es software libre con licencia GPL-3.0: puedes usarlo, estudiarlo, modificarlo y redistribuirlo libremente.', 'Licencia'],
  pt: ['Código-fonte no GitHub', 'O Gallium é gratuito e de código aberto. Se ele for útil para você, pode apoiar o desenvolvimento com uma doação.', 'O Gallium é software livre sob a licença GPL-3.0: você pode usá-lo, estudá-lo, modificá-lo e redistribuí-lo livremente.', 'Licença'],
  it: ['Codice sorgente su GitHub', 'Gallium è gratuito e open source. Se ti è utile, puoi sostenerne lo sviluppo con una donazione.', 'Gallium è software libero con licenza GPL-3.0: puoi usarlo, studiarlo, modificarlo e ridistribuirlo liberamente.', 'Licenza'],
  de: ['Quellcode auf GitHub', 'Gallium ist kostenlos und Open Source. Wenn es dir hilft, kannst du die Entwicklung mit einer Spende unterstützen.', 'Gallium ist freie Software unter der GPL-3.0-Lizenz: Du darfst es frei nutzen, untersuchen, verändern und weitergeben.', 'Lizenz'],
  nl: ['Broncode op GitHub', 'Gallium is gratis en open source. Heb je er iets aan, dan kun je de ontwikkeling steunen met een donatie.', 'Gallium is vrije software onder de GPL-3.0-licentie: je mag het vrij gebruiken, bestuderen, aanpassen en verspreiden.', 'Licentie'],
  sv: ['Källkod på GitHub', 'Gallium är gratis och öppen källkod. Om du har nytta av det kan du stödja utvecklingen med en donation.', 'Gallium är fri programvara under GPL-3.0-licensen: du får fritt använda, studera, ändra och sprida det.', 'Licens'],
  pl: ['Kod źródłowy na GitHubie', 'Gallium jest darmowy i otwartoźródłowy. Jeśli ci się przydaje, możesz wesprzeć jego rozwój darowizną.', 'Gallium to wolne oprogramowanie na licencji GPL-3.0: możesz go swobodnie używać, badać, modyfikować i rozpowszechniać.', 'Licencja'],
  ro: ['Cod sursă pe GitHub', 'Gallium este gratuit și open source. Dacă îți este util, îi poți susține dezvoltarea cu o donație.', 'Gallium este software liber sub licența GPL-3.0: îl poți folosi, studia, modifica și redistribui liber.', 'Licență'],
  tr: ['GitHub\'da kaynak kodu', 'Gallium ücretsiz ve açık kaynaklıdır. İşine yarıyorsa, bağış yaparak geliştirilmesine destek olabilirsin.', 'Gallium, GPL-3.0 lisanslı özgür bir yazılımdır: onu özgürce kullanabilir, inceleyebilir, değiştirebilir ve dağıtabilirsin.', 'Lisans'],
  ru: ['Исходный код на GitHub', 'Gallium бесплатный и с открытым исходным кодом. Если он тебе полезен, можешь поддержать разработку пожертвованием.', 'Gallium — свободное ПО под лицензией GPL-3.0: его можно свободно использовать, изучать, изменять и распространять.', 'Лицензия'],
  uk: ['Вихідний код на GitHub', 'Gallium безкоштовний і з відкритим кодом. Якщо він тобі корисний, можеш підтримати розробку пожертвою.', 'Gallium — вільне ПЗ за ліцензією GPL-3.0: його можна вільно використовувати, вивчати, змінювати й поширювати.', 'Ліцензія'],
  ar: ['الشيفرة المصدرية على GitHub', 'Gallium مجاني ومفتوح المصدر. إذا كان مفيدًا لك، يمكنك دعم تطويره بتبرّع.', 'Gallium برنامج حر بترخيص GPL-3.0: يمكنك استخدامه ودراسته وتعديله وإعادة توزيعه بحرية.', 'الترخيص'],
  hi: ['GitHub पर सोर्स कोड', 'Gallium मुफ़्त और ओपन सोर्स है। अगर यह आपके काम आता है, तो आप दान देकर इसके विकास में मदद कर सकते हैं।', 'Gallium GPL-3.0 लाइसेंस के तहत मुक्त सॉफ़्टवेयर है: आप इसे स्वतंत्र रूप से इस्तेमाल, अध्ययन, संशोधित और पुनर्वितरित कर सकते हैं।', 'लाइसेंस'],
  id: ['Kode sumber di GitHub', 'Gallium gratis dan open source. Jika bermanfaat bagimu, kamu bisa mendukung pengembangannya dengan donasi.', 'Gallium adalah perangkat lunak bebas berlisensi GPL-3.0: kamu bebas memakai, mempelajari, mengubah, dan menyebarkannya.', 'Lisensi'],
  vi: ['Mã nguồn trên GitHub', 'Gallium miễn phí và mã nguồn mở. Nếu thấy hữu ích, bạn có thể ủng hộ việc phát triển bằng một khoản quyên góp.', 'Gallium là phần mềm tự do theo giấy phép GPL-3.0: bạn được tự do sử dụng, tìm hiểu, sửa đổi và phân phối lại.', 'Giấy phép'],
  zh: ['GitHub 上的源代码', 'Gallium 免费且开源。如果它对你有帮助，你可以通过捐赠来支持它的开发。', 'Gallium 是采用 GPL-3.0 许可证的自由软件：你可以自由地使用、研究、修改和再分发。', '许可证'],
  ja: ['GitHub のソースコード', 'Gallium は無料のオープンソースです。役に立ったら、寄付で開発を応援できます。', 'Gallium は GPL-3.0 ライセンスのフリーソフトウェアです。自由に使用・研究・改変・再配布できます。', 'ライセンス'],
  ko: ['GitHub 소스 코드', 'Gallium은 무료 오픈 소스예요. 도움이 되었다면 후원으로 개발을 응원할 수 있어요.', 'Gallium은 GPL-3.0 라이선스의 자유 소프트웨어예요. 자유롭게 사용하고, 연구하고, 수정하고, 재배포할 수 있어요.', '라이선스'],
};
for (const [code, vals] of Object.entries(T)) {
  if (vals.length !== K.length) throw new Error(code);
  const f = path.join(DIR, code + '.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete d[OLD];
  K.forEach((k, i) => { d[k] = vals[i]; });
  fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n');
}
console.log('mis à jour :', Object.keys(T).length, 'langues');
