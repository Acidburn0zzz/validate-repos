const fetch = require("node-fetch");
const Octokat = require("octokat");
const config = require("./config.json");

const ghBlobToString = blob => new Buffer(blob.content, 'base64').toString('utf8');
const nlToSpace = str => str.replace(/\n/g, " ").replace(/  /g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

fetch("https://w3c.github.io/spec-dashboard/groups.json")
    .then(r => r.json())
    .then(groupData => {
        const groupIds = Object.keys(groupData);
        Promise.all(groupIds.map(id => fetch("https://w3c.github.io/spec-dashboard/pergroup/" + id + "-repo.json").then(r=>r.json()).catch(err => console.error("Failed to fetch data for group " + id + ": " + err))))
            .then(results => {
                const repos = new Set();
                results.filter(x => x).forEach(groupSpecs => Object.keys(groupSpecs).forEach(spec => repos.add(groupSpecs[spec].repo.owner + '/' + groupSpecs[spec].repo.name)));

                //console.log(repos);
                let contributing, contributingSw, license, licenseSw;
                const octo = new Octokat({ token: config.ghToken });
                const errors = {"now3cjson":[], "invalidcontacts":[], "nocontributing":[], "invalidcontributing": [], "nolicense": [], "invalidlicense": [], "noreadme": [], "contacts": new Set()};
                Promise.all([...repos].map(repofullname => {
                    return octo.repos('w3c/licenses').contents('WG-CONTRIBUTING.md').fetch().then(ghBlobToString).then(text => contributing = text)
                        .then(() => octo.repos('w3c/licenses').contents('WG-CONTRIBUTING-SW.md').fetch().then(ghBlobToString).then(text => contributingSw = text))
                        .then(() => octo.repos('w3c/licenses').contents('WG-LICENSE.md').fetch().then(ghBlobToString).then(text => license = text))
                        .then(() => octo.repos('w3c/licenses').contents('WG-LICENSE-SW.md').fetch().then(ghBlobToString).then(text => licenseSw = text))
                        .then(() =>
                              octo.repos(...repofullname.split('/'))
                              .contents('w3c.json').fetch())
                        .then(ghBlobToString)
                        .then(str => JSON.parse(str))
                        .then(function(w3cinfo) {
                            return Promise.all(w3cinfo.contacts.map(function(username) {
                                if (typeof username !== "string") {
                                    errors.invalidcontacts.push({repo: repofullname, value: username});
                                    return;
                                } else {
                                    return octo.users(username).fetch()
                                        .then(function(u) {
                                            errors.contacts.add(u.email ? u.email : u.login);
/*                                            if (!u.email) {
                                                console.error("Cannot determine email of " + u.login + ", listed as contact for " + repofullname);
                                                }*/
                                            return;
                                        }, () => errors.invalidcontacts.push({repo: repofullname, value: username}));
                                }
                            }));
                        }).catch(() => errors.now3cjson.push(repofullname))
                            .then(() => octo.repos(...repofullname.split('/'))
                                  .contents('CONTRIBUTING.md').fetch()
                                  .then(ghBlobToString)
                                  .then((repoContributing) => {
                                      if (!mdMatch(repoContributing, contributing) && !mdMatch(repoContributing,contributingSw)) errors.invalidcontributing.push({repo: repofullname, contributing: repoContributing});
                                  }, () => errors.nocontributing.push(repofullname)))
                        .then(() => octo.repos(...repofullname.split('/'))
                              .contents('LICENSE.md').fetch()
                              .then(ghBlobToString)
                              .then((repoLicense) => {
                                  if (!mdMatch(repoLicense, license) && !mdMatch(repoLicense, licenseSw)) errors.invalidlicense.push({repo: repofullname, license: repoLicense});

                              }, () => errors.nolicense.push(repofullname)))
                        .then(() => octo.repos(...repofullname.split('/'))
                              .contents('README.md').fetch()
                              .then(ghBlobToString)
                              .then(() => {
                                  // test content
                              }, () => errors.noreadme.push(repofullname)));
                })).then(() => {
                    errors.contacts = [...errors.contacts];
                    console.log(JSON.stringify(errors,null,2));
                });
            });
    });
