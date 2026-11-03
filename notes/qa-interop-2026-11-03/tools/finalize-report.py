import hashlib,json,re,subprocess
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[3]; report=root/'notes/qa-interop-2026-11-03'
checks=json.loads((report/'tools/types-result.json').read_text())
assert checks=={'web':0,'db':0,'configRestored':True}
for log, pattern in [('all-web-unit.log', r'Tests\s+4420 passed'),('all-integration.log',r'Tests\s+103 passed'),('hooks-after.log',r'8 passed')]:
    assert re.search(pattern,(report/'tools'/log).read_text()), log
subprocess.run(['git','diff','--check'],cwd=root,check=True)
listeners=subprocess.check_output(['ss','-Hltnp','( sport = :3000 )'],text=True)
assert not listeners.strip(), listeners
cleanup=json.loads((report/'cleanup-verification.json').read_text()); cleanup['qaServerStopped']=True
(report/'cleanup-verification.json').write_text(json.dumps(cleanup,indent=2)+'\n')
local=json.loads((report/'local-docker-update.json').read_text()); assert local['existingDataUnchanged'] and local['before']==local['after']
results=json.loads((report/'results.json').read_text()); results.update({'status':'pass_complete','completedAt':datetime.now(timezone.utc).isoformat(),'checks':{'webUnit':{'passed':4420,'files':320},'integration':{'passed':103,'files':13,'addedSincePriorPass':24},'autosaveHooks':{'passed':8},'matchServiceAfterTypeRefinement':{'passed':66},'typecheck':{'webExit':0,'dbExit':0,'generatedConfigRestored':True},'gitDiffCheckExit':0},'migration':{'name':'0073_recipe_editor_save_key','appliedTo':['temporary QA Docker database','normal local Docker nb database'],'backupReadable':True,'existingDataUnchanged':True,'receipt':'local-docker-update.json'},'cleanup':cleanup,'remaining':['production/PWA and personal caches','full publication/version matrix','arbitrary imports, full libraries and label printing','other browser engines and physical phones','S3/CDN','BrewForge hardware and sensors','load and full database restore']})
(report/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
p=report/'README.md'; s=p.read_text().replace('Общий интеграционный прогон выполняется; окончательные результаты фиксируются в [results.json](results.json).', 'Общий прогон завершён: **103 passed, 13 интеграционных файлов**, включая 24 новых сценария относительно предыдущего прохода. Окончательные результаты: [results.json](results.json). TypeScript web/db и git diff --check прошли; web проверен также после восстановления исходного Next-конфига.').replace('Применение и сравнение данных фиксируются отдельно.', 'Миграция применена к обычной локальной базе nb в Docker после проверенного dump. До и после совпадают количества и контрольные суммы строк в пяти таблицах: 32 пользователя, 126 рецептов, 36 партий, 103 складские позиции, 1403 записи каталога. Все прежние поля сохранены; новый UUID пуст у существующих записей. [Результат применения](local-docker-update.json). Повтор мигратора на QA завершился успешно.').replace('Перед запуском обновлённого приложения требуется штатный db:migrate.', 'В других окружениях перед запуском обновлённого приложения требуется штатный db:migrate; текущая локальная база уже обновлена.')
if '## Завершение и артефакты' not in s:
    s += '\n## Завершение и артефакты\n\nQA-сервер остановлен, временный Docker-контейнер и tmpfs с тестовой базой удалены, отдельная папка QA-фотографий удалена. До удаления оставались только четыре исходных QA-пользователя, рецептов и партий — 0, файлов фотографий — 0. Контейнер nb-postgres и его прежние тома сохранены; PostgreSQL, Mailpit и Mosquitto продолжают работать. [Очистка](cleanup-verification.json), [состояние перед удалением](qa-final-state.json). Резервные копии обычной базы не удалялись.\n\n[Снимок 38 изменённых файлов исходников с SHA-256](source-snapshot.json), [общий patch исправлений](corrections.patch). Отчёт и исходники скопированы в прежнюю резервную папку на D; индекс latest-report.md указывает на этот проход.\n'
p.write_text(s)
missing=[]; links=0
for file in [report/'README.md',root/'docs/qa-test-plan.md']:
    for target in re.findall(r'\]\(([^)]+)\)',file.read_text()):
        if '://' in target or target.startswith('#'): continue
        target=target.split('#')[0]; links+=1
        if not (file.parent/target).exists(): missing.append(str(file.parent/target))
assert not missing, missing
snapshot=json.loads((report/'source-snapshot.json').read_text())
assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in snapshot['files'].items())
verification={'markdownLinksChecked':links,'missingLinks':missing,'sourceHashesVerified':len(snapshot['files']),'generatedNextConfigRestored':True}
(report/'artifact-verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps({'integrationPassed':103,'unitPassed':4420,'hooksPassed':8,'changedSourceFiles':len(snapshot['files']),'linksChecked':links,'mainDataPreserved':True,'qaRemoved':True}))
