from pathlib import Path

# 1) Base app legacy-browser migration must identify its source.
app_path=Path("public/app.js")
app=app_path.read_text(encoding="utf-8")
old='''      await api("/api/learning-data",{method:"POST",body:{data:state.data}});'''
new='''      await api("/api/learning-data",{method:"POST",body:{data:state.data,appShellAuthority:"v1",reason:"legacy-browser-migration"}});'''
if app.count(old)!=1:
    raise SystemExit(f"legacy browser migration POST count was {app.count(old)}")
app=app.replace(old,new,1)
app_path.write_text(app,encoding="utf-8")

# 2) Fresh-user defaults are a real writer and must declare authority.
defaults_path=Path("public/new-user-defaults-v3.js")
defaults=defaults_path.read_text(encoding="utf-8")
old='''        body:JSON.stringify({data}),'''
new='''        body:JSON.stringify({data,newUserDefaultsAuthority:"v3"}),'''
if defaults.count(old)!=1:
    raise SystemExit(f"new-user defaults POST body count was {defaults.count(old)}")
defaults=defaults.replace(old,new,1)
defaults_path.write_text(defaults,encoding="utf-8")

# 3) Review Policy must continue from the persistence-confirmed Gateway result.
policy_path=Path("public/review-policy-v3.js")
policy=policy_path.read_text(encoding="utf-8")
old='''      if(!response.ok)throw new Error("SAVE_FAILED");
      latestData=core.normalizeData(next);
      latestData.settings=normalizeSettings(latestData.settings||{});'''
new='''      if(!response.ok)throw new Error("SAVE_FAILED");
      if(!syncFromGateway())latestData=core.normalizeData(next);
      latestData.settings=normalizeSettings(latestData.settings||{});'''
if policy.count(old)!=1:
    raise SystemExit(f"Review Policy post-save local assignment count was {policy.count(old)}")
policy=policy.replace(old,new,1)
policy_path.write_text(policy,encoding="utf-8")

# Extend contracts.
gateway_check=Path("scripts/check-learning-data-gateway-v3.js")
check=gateway_check.read_text(encoding="utf-8")
read_anchor='''const app=read("public/app.js");'''
if read_anchor not in check:
    raise SystemExit("Gateway check must already read app.js")
if 'const newUserDefaults=read("public/new-user-defaults-v3.js");' not in check:
    check=check.replace(read_anchor,read_anchor+'\nconst newUserDefaults=read("public/new-user-defaults-v3.js");',1)
anchor='''assert(app.includes('appShellAuthority:"v1"'),"base app learning-data writes must identify their authority for persistence diagnostics");'''
addition='''
assert(app.includes('reason:"legacy-browser-migration"'),"legacy browser-data import must identify its one-time migration reason");
assert(newUserDefaults.includes('newUserDefaultsAuthority:"v3"'),"fresh-user defaults must identify their learning-data writer authority");'''
if check.count(anchor)!=1:
    raise SystemExit("Gateway writer-authority assertion anchor not unique")
if "fresh-user defaults must identify their learning-data writer authority" not in check:
    check=check.replace(anchor,anchor+addition,1)
gateway_check.write_text(check,encoding="utf-8")

policy_check=Path("scripts/check-review-policy-v3.js")
pc=policy_check.read_text(encoding="utf-8")
anchor='''assert(policyUi.includes('reviewPolicyAuthority:"v3"'),"Review setting writes must declare V3 authority");'''
addition='''
assert(policyUi.includes("if(!syncFromGateway())latestData=core.normalizeData(next);"),"Review Policy must continue from the Gateway-confirmed persisted snapshot after a successful write");'''
if pc.count(anchor)!=1:
    raise SystemExit("Review Policy authority assertion anchor not unique")
if "must continue from the Gateway-confirmed persisted snapshot" not in pc:
    pc=pc.replace(anchor,anchor+addition,1)
policy_check.write_text(pc,encoding="utf-8")
