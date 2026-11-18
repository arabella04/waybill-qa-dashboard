function doGet(e) {
  var email = '';
  try {
    email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (err) {
    email = '';
  }

  var userObj = null;
  if (email && email.indexOf('@1life.ph', email.length - 9) !== -1) {
    var nameMap = {
      'armorales@1life.ph': 'Arabella Morales',
      'jtcanaway@1life.ph': 'Janryl Jay Canaway',
      'jofrancisco@1life.ph': 'John Michael Francisco',
      'jrdayag@1life.ph': 'Julius Rod Dayag',
      'ynlao@1life.ph': 'Yesha Nicholai Lao'
    };
    var displayName = nameMap[email] || email.split('@')[0];
    var parts = displayName.split(' ');
    var initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    userObj = {
      name: displayName,
      email: email,
      role: 'QA Specialist',
      initials: initials,
      auth_provider: 'google_apps_script',
      verified_hd: '1life.ph'
    };
  }

  var template = HtmlService.createTemplateFromFile('Index');
  template.appsScriptUserJson = JSON.stringify(userObj);

  return template.evaluate()
    .setTitle('1Life Q.A Task Dashboard — Waybill & Operational QA')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
