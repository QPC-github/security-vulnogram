// Copyright (c) 2017 Chandan B N. All rights reserved.
 
var CVSSseveritys = [{
    name: "NONE",
    bottom: 0.0,
    top: 0.0
}, {
    name: "LOW",
    bottom: 0.1,
    top: 3.9
}, {
    name: "MEDIUM",
    bottom: 4.0,
    top: 6.9
}, {
    name: "HIGH",
    bottom: 7.0,
    top: 8.9
}, {
    name: "CRITICAL",
    bottom: 9.0,
    top: 10.0
}];

function CVSSseverity(score) {
    var i;
    var severityRatingLength = this.CVSSseveritys.length;
    for (i = 0; i < severityRatingLength; i++) {
        if (score >= this.CVSSseveritys[i].bottom && score <= this.CVSSseveritys[i].top) {
            return this.CVSSseveritys[i];
        }
    }
    return {
        name: "?",
        bottom: 'Not',
        top: 'defined'
    };
}

function CVSScalculate (cvss) {
    var cvssVersion = "3.0";
    var exploitabilityCoefficient = 8.22;
    var scopeCoefficient = 1.08;

    // Define associative arrays mapping each metric value to the constant used in the CVSS scoring formula.

    var Weight = {
        attackVector: {
            NETWORK: 0.85,
            ADJACENT_NETWORK: 0.62,
            LOCAL: 0.55,
            PHYSICAL: 0.2
        },
        attackComplexity: {
            HIGH: 0.44,
            LOW: 0.77
        },
        privilegesRequired: {
            UNCHANGED: {
                NONE: 0.85,
                LOW: 0.62,
                HIGH: 0.27
            },
            // These values are used if Scope is Unchanged
            CHANGED: {
                NONE: 0.85,
                LOW: 0.68,
                HIGH: 0.5
            }
        },
        // These values are used if Scope is Changed
        userInteraction: {
            NONE: 0.85,
            REQUIRED: 0.62
        },
        scope: {
            UNCHANGED: 6.42,
            CHANGED: 7.52
        },
        confidentialityImpact: {
            NONE: 0,
            LOW: 0.22,
            HIGH: 0.56
        },
        integrityImpact: {
            NONE: 0,
            LOW: 0.22,
            HIGH: 0.56
        },
        availabilityImpact: {
            NONE: 0,
            LOW: 0.22,
            HIGH: 0.56
        }
        // C, I and A have the same weights

    };

    var p;
    var val = {},
        metricWeight = {};
    try {
        for (p in Weight) {
            val[p] = cvss[p];
            if (typeof val[p] === "undefined" || val[p] === '') {
                return "?";
            }
            metricWeight[p] = Weight[p][val[p]];
        }
    } catch (err) {
        return err; // TODO: need to catch and return sensible error value & do a better job of specifying *which* parm is at fault.
    }
    metricWeight.privilegesRequired = Weight.privilegesRequired[val.scope][val.privilegesRequired];
    //
    // CALCULATE THE CVSS BASE SCORE
    //
    try {
        var baseScore;
        var impactSubScore;
        var exploitabalitySubScore = exploitabilityCoefficient * metricWeight.attackVector * metricWeight.attackComplexity * metricWeight.privilegesRequired * metricWeight.userInteraction;
        var impactSubScoreMultiplier = (1 - ((1 - metricWeight.confidentialityImpact) * (1 - metricWeight.integrityImpact) * (1 - metricWeight.availabilityImpact)));
        if (val.scope === 'UNCHANGED') {
            impactSubScore = metricWeight.scope * impactSubScoreMultiplier;
        } else {
            impactSubScore = metricWeight.scope * (impactSubScoreMultiplier - 0.029) - 3.25 * Math.pow(impactSubScoreMultiplier - 0.02, 15);
        }


        if (impactSubScore <= 0) {
            baseScore = 0;
        } else {
            if (val.scope === 'UNCHANGED') {
                baseScore = Math.min((exploitabalitySubScore + impactSubScore), 10);
            } else {
                baseScore = Math.min((exploitabalitySubScore + impactSubScore) * scopeCoefficient, 10);
            }
        }

        baseScore = Math.ceil(baseScore * 10) / 10;
        return baseScore;
    } catch (err) {
        return err;
    }
}


var output = document.getElementById('output');
var starting_value = {};

var sourceEditor = ace.edit("output");
sourceEditor.getSession().setMode("ace/mode/json");
sourceEditor.getSession().on('change', incSourceChanges);
sourceEditor.setOptions({
    maxLines: 480,
    wrap: true
});
sourceEditor.$blockScrolling = Infinity;
var vectorMap = {
    "attackVector": "AV",
    "attackComplexity": "AC",
    "privilegesRequired": "PR",
    "userInteraction": "UI",
    "scope": "S",
    "confidentialityImpact": "C",
    "integrityImpact": "I",
    "availabilityImpact": "A"
};

function cvssUpdate() {
    cveEditor.unwatch('root.impact.cvss');
    var cvssEditor = cveEditor.getEditor('root.impact.cvss');
    if (cvssEditor) {
        var c = cvssEditor.getValue();
        var vectorString = "CVSS:" + cveEditor.getEditor('root.impact.cvss.version').getValue();
        var sep = '/';
        for (var m in c) {
            if (vectorMap[m]) {
                vectorString += sep + vectorMap[m] + ':' + c[m].charAt(0);
            }
        }
        c.baseScore = CVSScalculate(c);
        c.vectorString = vectorString;
        c.baseSeverity = CVSSseverity(c.baseScore).name;
        cvssEditor.setValue(c);
    }
    cveEditor.watch('root.impact.cvss', cvssUpdate);
}

function syncContents() {
    var j = cveEditor.getValue();
    insync = true;
    sourceEditor.getSession().setValue(JSON.stringify(j, null, 2));
    sourceEditor.clearSelection();
    insync = false;
    if (document.getElementById("yaml")) {
        document.getElementById("yaml").textContent = YAML.stringify(j, 20, 2);
    }
    document.getElementById("advisory").innerHTML = window.advisoryTemplate(j);
    document.getElementById("mitreweb").innerHTML = window.mitrewebTemplate(j);
    document.getElementById("cvejson").textContent = textUtil.getMITREJSON(textUtil.reduceJSON(j));
}

JSONEditor.defaults.resolvers.unshift(function (schema) {
    if (schema.type === "string" && schema.format === "radio") {
        return "radio";
    }
});

JSONEditor.defaults.editors.radio = JSONEditor.AbstractEditor.extend({
    setValue: function (value, initial) {
        value = this.typecast(value || '');

        // Sanitize value before setting it
        var sanitized = value;
        if (this.schema.enum.indexOf(sanitized) < 0) {
            sanitized = this.schema.enum[0];
        }

        if (this.value === sanitized) {
            return;
        }

        var self = this;
        for (var input in this.inputs) {
            if (input === sanitized) {

                this.inputs[input].checked = true;
                self.value = sanitized;
                self.jsoneditor.notifyWatchers(self.path);
                return false;
            }
        }
    },
    register: function () {
        this._super();
        if (!this.inputs) return;
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].setAttribute('name', this.formname);
        }
    },
    unregister: function () {
        this._super();
        if (!this.inputs) return;
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].removeAttribute('name');
        }
    },
    getNumColumns: function () {
        var longest_text = this.getTitle().length;
        for (var i = 0; i < this.schema.enum.length; i++) {
            longest_text = Math.max(longest_text, this.schema.enum[i].length + 4);
        }
        return Math.min(12, Math.max(longest_text / 7, 2));
    },
    typecast: function (value) {
        if (this.schema.type === "boolean") {
            return !!value;
        } else if (this.schema.type === "number") {
            return 1 * value;
        } else if (this.schema.type === "integer") {
            return Math.floor(value * 1);
        } else {
            return "" + value;
        }
    },
    getValue: function () {
        return this.value;
    },
    removeProperty: function () {
        this._super();
        for (var i=0; i< this.inputs.length; i++) {
            this.inputs[i].style.display = 'none';
        }
        if (this.description) this.description.style.display = 'none';
        this.theme.disableLabel(this.label);
    },
    addProperty: function () {
        this._super();
        for (var i=0; i< this.inputs.length; i++) {
            this.inputs[i].style.display = '';
        }
        if (this.description) this.description.style.display = '';
        this.theme.enableLabel(this.label);
    },
    sanitize: function (value) {
        if (this.schema.type === "number") {
            return 1 * value;
        } else if (this.schema.type === "integer") {
            return Math.floor(value * 1);
        } else {
            return "" + value;
        }
    },
    build: function () {
        var self = this,
            i;
        if (!this.options.compact) this.header = this.label = this.theme.getFormInputLabel(this.getTitle());
        if (this.schema.description) this.description = this.theme.getFormInputDescription(this.schema.description);

        this.select_options = {};
        this.select_values = {};

        var e = this.schema.enum || [];
        var options = [];
        for (i = 0; i < e.length; i++) {
            // If the sanitized value is different from the enum value, don't include it
            if (this.sanitize(e[i]) !== e[i]) continue;

            options.push(e[i] + "");
            this.select_values[e[i] + ""] = e[i];
        }

        this.input_type = 'radiogroup';
        this.inputs = {};
        this.controls = {};
        for (i = 0; i < options.length; i++) {
            this.inputs[options[i]] = this.theme.getRadio();
            this.inputs[options[i]].setAttribute('value', options[i]);
            this.inputs[options[i]].setAttribute('name', this.formname);
            this.inputs[options[i]].setAttribute('id', this.formname + options[i]);
            var label = this.theme.getRadioLabel((this.schema.enumTitles && this.schema.enumTitles[options[i]]) ?
                this.schema.enumTitles[options[i]] :
                options[i]);
            label.setAttribute('for', this.formname + options[i]);
            label.setAttribute('class', options[i]);
            this.controls[options[i]] = this.theme.getFormControl(this.inputs[options[i]], label);
        }

        this.control = this.theme.getRadioGroupHolder(this.controls, this.label, this.description);
        this.container.appendChild(this.control);
        this.control.addEventListener('change', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var val = e.target.value;

            var sanitized = val;
            if (self.schema.enum.indexOf(val) === -1) {
                sanitized = self.schema.enum[0];
            }

            self.value = sanitized;

            if (self.parent) self.parent.onChildEditorChange(self);
            else self.jsoneditor.onChange();
            self.jsoneditor.notifyWatchers(self.path);
        });
    },
    enable: function () {
        if (!this.always_disabled) {
            for (var i=0; i< this.inputs.length; i++) {
                this.inputs[i].disabled = false;
            }
        }
        this._super();
    },
    disable: function () {
        for (var i=0; i< this.inputs.length; i++) {
            this.inputs[i].disabled = true;
        }
        this._super();
    },
    destroy: function () {
        if (this.label) this.label.parentNode.removeChild(this.label);
        if (this.description) this.description.parentNode.removeChild(this.description);
        for (var i=0; i< this.inputs.length; i++) {
            this.inputs[i].parentNode.removeChild(this.inputs[i]);
        }
        this._super();
    }
});

function tzOffset() {
    var offset = new Date().getTimezoneOffset(),
        o = Math.abs(offset);
        return (offset < 0 ? "+" : "-") + ("00" + Math.floor(o / 60)).slice(-2) + ":" + ("00" + (o % 60)).slice(-2);   
}

// The time is displayed/set in local times in the input,
//  but setValue, getValue use UTC. JSON output will be in UTC.
JSONEditor.defaults.editors.dateTime = JSONEditor.defaults.editors.string.extend({
    getValue: function () {
        if(this.value && this.value.length > 0) {
            if(this.value.match(/^\d{4}-\d{2}-\d{2}T[\d\:\.]+$/)) {
                this.value = this.value + tzOffset();
            }
            var d = new Date(this.value);
            if(d instanceof Date && !isNaN(d.getTime())) {
                return d.toISOString();
            } else {
                return this.value;
            }
        } else {
            return "";
        }
    },

    setValue: function (val) {
        if(val && this.value.match(/^\d{4}-\d{2}-\d{2}T[\d\:\.]+$/)) {
                val = val + tzOffset();
        }
        var d = new Date(val);
        if(d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0) {
            this.value = 
            this.input.value = new Date((d.getTime() - (d.getTimezoneOffset() * 60000))).toJSON().slice(0,16);
        } else {
            this.value = this.input.value = "";
        
        }
    },

    build: function () {
        this.schema.format = "datetime-local";
        this._super();
        var tzInfo = document.createElement('small');
        tzInfo.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.input.parentNode.appendChild(tzInfo);

    }
});

// Instruct the json-editor to use the custom datetime-editor.
JSONEditor.defaults.resolvers.unshift(function (schema) {
    if (schema.type === "string" && schema.format === "datetime") {
        return "dateTime";
    }

});

JSONEditor.defaults.editors.object = JSONEditor.defaults.editors.object.extend({
    layoutEditors: function () {
        var propertyNumber = 1;
        for (let key of Object.keys(this.editors)) {
            let schema = this.editors[key].schema;
            if (!schema.propertyOrder) {
                schema.propertyOrder = propertyNumber;
            }
            ++propertyNumber;
        }
        this._super();
    }
});

JSONEditor.defaults.themes.custom = JSONEditor.AbstractTheme.extend({
    getFormInputLabel: function (text) {
        var el = this._super(text);
        el.className = text;
        return el;
    },
    getFormInputDescription: function (text) {
        var el = this._super(text);
        return el;
    },
    getIndentedPanel: function () {
        var el = this._super();
        el.style = "";
        return el;
    },
    getChildEditorHolder: function () {
        var el = this._super();
        return el;
    },
    getHeaderButtonHolder: function () {
        var el = this.getButtonHolder();
        return el;
    },
    getHeader: function (text) {
        var el = document.createElement('h3');
        if (typeof text === "string") {
            el.textContent = text;
            el.className = text;
        } else {
            text.className = text.textContent;
            el.appendChild(text);
        }
        return el;
    },
    getTable: function () {
        var el = this._super();
        return el;
    },
    addInputError: function (input, text) {
        input.style.borderColor = 'coral';

        if (!input.errmsg) {
            var group = this.closest(input, '.form-control');
            input.errmsg = document.createElement('div');
            input.errmsg.setAttribute('class', 'errmsg');
            input.errmsg.style = input.errmsg.style || {};
            group.appendChild(input.errmsg);
        } else {
            input.errmsg.style.display = 'block';
        }

        input.errmsg.textContent = '';
        input.errmsg.appendChild(document.createTextNode(text));
    },
    removeInputError: function (input) {
        input.style.borderColor = '';
        if (input.errmsg) input.errmsg.style.display = 'none';
    },
    getRadio: function () {
        var el = this.getFormInputField('radio');
        return el;
    },
    getRadioGroupHolder: function (controls, label, description) {
        var el = document.createElement('div');
        var radioGroup = document.createElement('div');
        radioGroup.className = 'radiogroup';

        if (label) {
            label.style.display = 'inline-block';
            el.appendChild(label);
        }
        el.appendChild(radioGroup);
        for (var i in controls) {
            if (!controls.hasOwnProperty(i)) continue;
            radioGroup.appendChild(controls[i]);
        }

        if (description) el.appendChild(description);
        return el;
    },
    getRadioLabel: function (text) {
        var el = this.getFormInputLabel(text);
        return el;
    },
    getProgressBar: function () {
        var max = 100,
            start = 0;

        var progressBar = document.createElement('progress');
        progressBar.setAttribute('max', max);
        progressBar.setAttribute('value', start);
        return progressBar;
    },
    updateProgressBar: function (progressBar, progress) {
        if (!progressBar) return;
        progressBar.setAttribute('value', progress);
    },
    updateProgressBarUnknown: function (progressBar) {
        if (!progressBar) return;
        progressBar.removeAttribute('value');
    }
});


var cveEditor = new JSONEditor(document.getElementById('editor'), {
    // Enable fetching schemas via ajax
    ajax: true,
    theme: 'custom',
    disable_collapse: true,
    disable_array_reorder: true,
    disable_properties: true,
    disable_edit_json: true,
    disable_array_delete_last_row: true,
    disable_array_delete_all_rows: true,
    expand_height: true,
    input_width: '3em',
    input_height: '4em',
    // The schema for the editor
    schema: CVEschema,
    // Seed the form with a starting value
    //starting_value: {},

    // Disable additional properties
    //no_additional_properties: false,

    // Require all properties by default
    //required_by_default: false,
    //display_required_only: false
});

cveEditor.getEditor('root.impact.cvss.version').disable();
cveEditor.getEditor('root.impact.cvss.vectorString').disable();
cveEditor.getEditor('root.impact.cvss.baseScore').disable();
cveEditor.getEditor('root.impact.cvss.baseSeverity').disable();

/*
fuction enumExpand(src, obj) {
    if (enum in obj) {
        if(obj.enum)
    }
}
*/
if (cveEntry) {
    cveEditor.setValue(cveEntry.cve, true);
}

cvssUpdate();
syncContents();

function cveEditorValid(j) {
    var errors = [];
    if(j) {
        errors = cveEditor.validate(j);
    } else {
        errors = cveEditor.validate();
    }
    //console.log('validating CVE editor=' + errors.length);
    if (errors.length) {
        cveEditor.setOption('show_errors', 'always');
        errMsg.textContent = (errors.length > 1 ? errors.length + " errors" : "Error") + " found";
        editorLabel.className = "tablabel errtab";
        return false;
    } else {
        errMsg.textContent = "";
        editorLabel.className = "tablabel";
        return true;
    }
}

function source2cve() {
    insync = true;
    var result = JSON.parse(sourceEditor.getSession().getValue());
    cveEditor.root.setValue(result, true);
    insync = false;
    return result;
}

function sourceEditorValid() {
    try {
        var hasError = false;
        var firsterror = null;
        var annotations = sourceEditor.getSession().getAnnotations();
        for (var l in annotations) {
            var annotation = annotations[l];
            if (annotation.type === "error") {
                hasError = true;
                firsterror = annotation;
                break;
            }
        }
        if (!hasError) {
            return true;
        } else {
            sourceEditor.moveCursorTo(firsterror.row, firsterror.column, false);
            sourceEditor.clearSelection();
            errMsg.textContent = 'Please fix error: ' + firsterror.text;
            document.getElementById("sourceTab").checked = true;
            return false;
        }
    } catch (err) {
        errMsg.textContent = err.message;
        document.getElementById("sourceTab").checked = true;
        return false;
    } finally {}
}

function save() {
    if (document.getElementById("sourceTab").checked === true) {
        if (!sourceEditorValid()) {
            return;
        } else {
            var j = source2cve();
            if(!cveEditorValid(j)) {
                document.getElementById("editorTab").checked = true;
                return;
            }
        }
    }
    if (!cveEditorValid()) {
        document.getElementById("editorTab").checked = true;
        return;
    }

    infoMsg.textContent = "Saving...";
    var e = cveEditor.getValue();
    fetch('', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            redirect: 'error',
            body: JSON.stringify(e),
        })
        .then(function (response) {
            if (!response.ok) {
                throw Error(response.statusText);
            }
            return response.json();
        })
        .then(function (res) {
            if(res.type == "go") {
                window.location.href = res.to;
            } else if (res.type == "err") {
                errMsg.textContent = res.msg;
                infoMsg.textContent = "";
            } else if (res.type == "saved") {
                infoMsg.textContent = "Saved";
                errMsg.textContent = "";
                document.title = originalTitle;
                // turn button to normal, indicate nothing to save,
                // but do not disable it.
                if(document.getElementById("save1")) {
                    save2.className = save1.className = "button tabbutton save";
                }
            }
            changes = 0;
        })
        .catch(function (error) {
            errMsg.textContent = error + ' Try reloadin the page';
        });

}

if(document.getElementById('save1') && document.getElementById('save2')) {
    document.getElementById('save1').addEventListener('click', save);
    document.getElementById('save2').addEventListener('click', save);
    document.getElementById('save2').removeAttribute("style");
}

// Hook up the delete button to log to the console
if(document.getElementById('remove')) {
document.getElementById('remove').addEventListener('click', function () {
    var e = cveEditor.getValue();
    if (confirm('Delete ' + e.CVE_data_meta.ID + '?')) {
        fetch('/cves/' + e.CVE_data_meta.ID, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'CSRF-Token': csrfToken
            },
        }).then(function (response) {
            if (response.status == 200) {
                infoMsg.textContent = "Deleted ";
                errMsg.textContent = "";
                window.location = "/cves/";
            } else {
                errMsg.textContent = "Error " + response.statusText;
                infoMsg.textContent = "";
            }
        });
    }
});
}

// hack to auto generate description/ needs improvement
var autoButton = document.getElementById('auto');

var descDiv = document.querySelector('[data-schemapath="root.description.description_data"] div ');
if (descDiv) {

    descDiv.appendChild(autoButton);
    autoButton.removeAttribute("style");
}

autoButton.addEventListener('click', function () {
    var d = cveEditor.getEditor('root.description.description_data');
    var cve = cveEditor.getValue();
    desc = d.getValue();
    if (d) {
        var i = desc.length;
        while (i--) {
            if (desc[i].value.length === 0) {
                desc.splice(i, 1);
            }
        }
        desc.push({
            lang: "eng",
            value: "A " + cve.problemtype.problemtype_data[0].description[0].value + " vulnerability in ____COMPONENT____ of " + textUtil.getProductList(cve) +
                " allows ____ATTACKER/ATTACK____ to cause ____IMPACT____."
        });
        desc.push({
            lang: "eng",
            value: "Affected releases are " + textUtil.getAffectedProductString(cve) + '.'
        });
        d.setValue(desc);
    } else {

    }
});

var originalTitle = document.title;
var changes = true;
var insync = false;

function incChanges() {
    if(!insync) {
        changes = true;
        infoMsg.textContent = 'Edited';
        document.title = originalTitle + ' (Edited)';
        errMsg.textContent = '';
        if(document.getElementById("save1")) {
                    save2.className = save1.className = "button tabbutton safe save";
        }
    }
}

function incEditorChanges() {
    if(selected == 'editorTab') {
        incChanges();
    }
}

function incSourceChanges() {
    if(selected == 'sourceTab') {
        incChanges();
    }
}

cveEditor.watch('root.impact.cvss', cvssUpdate);
cveEditor.watch('root', incEditorChanges);

var selected = "editorTab";

//trigger validation when either CVE edirtor or Source editor is deselected
function setupDeselectEvent() {
    var tabs = document.getElementsByName("tabs");
    for (var i = 0; i < tabs.length; i++) {
        t = tabs[i];
        t.addEventListener('change', function () {
            clicked = this.id;
            //console.log(selected + ' -to-> ' + clicked);
            if (selected != clicked) {
                switch (selected) {
                    case "editorTab":
                        cveEditorValid();
                        syncContents();
                        break;
                    case "sourceTab":
                        if(sourceEditorValid()) {
                            // for some setting value of CVE Editor and calling immediate validation returns no erroer
                            // run validation against the actual JSON being copied to Editor
                            var j = source2cve();
                            cveEditorValid(j);
                            syncContents();
                        } else {
                            clicked = "sourceTab";
                            document.getElementById("sourceTab").checked = true;
                        }
                        break;
                    default:
                        syncContents();
                }
            }
            selected = clicked;
        });
    }
}

setupDeselectEvent();

function loadCVE(value) {
    var realId = value.match(/(CVE-(\d{4})-(\d{1,12})(\d{3}))/);
    if(realId) {
        var id = realId[1];
        var year = realId[2];
        var bucket = realId[3];
        fetch('https://raw.githubusercontent.com/CVEProject/cvelist/master/'+ year + '/' + bucket + 'xxx/'+ id +'.json', {
            method: 'GET',
            credentials: 'omit',
            headers: {
                'Accept': 'application/json, text/plain, */*'
            },
            redirect: 'error',
        })
        .then(function (response) {
            if (!response.ok) {
                errMsg.textContent = "Failed to load valid CVE JSON";
                infoMsg.textContent = "";
                throw Error(id + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(function (res) {
            if (res.CVE_data_meta) {
                cveEditor.root.setValue(res, true);
                infoMsg.textContent = "Imported " + id +" from git";
                errMsg.textContent = "";
                document.title = id;
                if(document.getElementById("save1")) {
                    save2.className = save1.className = "button tabbutton save";
                }
                document.getElementById("editorTab").checked = true;
                changes = 0;
            } else {
                errMsg.textContent = "Failed to load valid CVE JSON";
                infoMsg.textContent = "";
            }
        })
        .catch(function (error) {
            errMsg.textContent = error;
        })
    } else {
        errMsg.textContent = "CVE ID required";
    }
}