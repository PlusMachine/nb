global.secondContext=await browser.newContext({viewport:{width:834,height:1112},isMobile:true,hasTouch:true,locale:'ru-RU'});
await secondContext.addCookies([{name:'nb_cookie_consent',value:'1:necessary',url:base},{name:'nb_dev_account',value:'qa.admin@localhost',url:base}]);
global.adminPage=await secondContext.newPage();
await scan(['/admin/masters','/admin/devices','/admin/firmware','/admin/feedback','/admin/audit','/admin/settings/currency','/admin/push'],[[360,800],[834,1112],[1024,768]],adminPage);
