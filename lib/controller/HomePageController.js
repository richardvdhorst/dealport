/*
 * DealPort
 * Copyright (c) 2014  DealPort B.V.
 *
 * This file is part of DealPort
 *
 * DealPort is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * DealPort is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with DealPort.  If not, see <http://www.gnu.org/licenses/>.
 *
 * In addition, the following supplemental terms apply, based on section 7 of
 * the GNU Affero General Public License (version 3):
 * a) Preservation of all legal notices and author attributions
 */

'use strict';

var P = require('bluebird');

var Controller = require('./Controller');
var StateAnchor = require('../view/StateAnchor');
var SubmitForm = require('../view/SubmitForm');
var ga = require('../google-analytics');
var lazyTimer = require('lazy-timer');
var hrtime = require('../swissarmyknife/hrtime');

function HomePageController(context)
{
        Controller.call(this, context);

        // send database updates every 500ms
        this._onEditChange = lazyTimer(500, true, this, this._onEditChangeImpl);
        this._onEditChangeSince = 0;
}

require('inherits')(HomePageController, Controller);
module.exports = HomePageController;

HomePageController.prototype.enterNone = function(state, upgrade)
{
        var doc = this.context.document;
        var router = this.context.router;
        var user = this.context.user;
        var pageView = this.parent.pageView;

        if (upgrade)
        {
                this.editAnchor = doc.contextualMenu.selector('> .editAnchor', StateAnchor, router);
        }
        else
        {
                if (user)
                {
                        doc.contextualMenu.appendChild(
                                this.editAnchor = new StateAnchor(
                                        doc.document,
                                        router,
                                        ['page', 'home', 'edit'],
                                        '[ edit ]'
                                ).cls('editAnchor')
                        );
                }
        }

        if (user)
        {
                pageView.on('domv-stateselect', this._onStateSelectAddCompany, false, this);
        }

};

HomePageController.prototype.leaveNone = function()
{
        var pageView = this.parent.pageView;
        pageView.removeListener('domv-stateselect', this._onStateSelectAddCompany, false, this);

        if (this.editAnchor)
        {
                this.editAnchor.removeNode();
                this.editAnchor = null;
        }
};

HomePageController.prototype.enterEdit = function(state, upgrade)
{
        var doc = this.context.document;
        var router = this.context.router;
        var user = this.context.user;
        var pageView = this.parent.pageView;

        if (upgrade)
        {
                this.editAnchor = doc.contextualMenu.selector('> .editAnchor', StateAnchor, router);
        }
        else
        {
                if (user)
                {
                        pageView.companyGrid.editing = true;
                }

                doc.contextualMenu.appendChild(
                        this.editAnchor = new StateAnchor(doc.document, router, ['page', 'home', 'none'], '[ stop editing ]').cls('editAnchor')
                );
        }

        if (user)
        {
                pageView.companyGrid.on('domv-editable-change', this._onEditChange, false, this);
                pageView.on('domv-stateselect', this._onStateSelectAddCompany, false, this);
        }
};

HomePageController.prototype.leaveEdit = function()
{
        var pageView = this.parent.pageView;
        pageView.companyGrid.removeListener('domv-editable-change', this._onEditChange, false, this);
        pageView.removeListener('domv-stateselect', this._onStateSelectAddCompany, false, this);
        pageView.companyGrid.editing = false;
        this.context.document.lastSave = null;
        this.editAnchor.removeNode();
        this.editAnchor = null;
};

HomePageController.prototype._onEditChangeImpl = function(done)
{
        var since = this._onEditChangeSince;
        this._onEditChangeSince = hrtime();
        var companyContexts = this.parent.companyContexts;
        var UploadedImage = this.context.resource.UploadedImage;

        P.using(this.context.document.savePendingDisposer(), function()
        {
                return companyContexts
                .bind(this)
                .then(function(acquireContextResult)
                {
                        // CompanyGridItem
                        var items = this.parent.pageView.companyGrid.companies;

                        return P.map(items, function(item)
                        {
                                var values = item.getValues(since);
                                if (!values)
                                {
                                        // nothing has been changed
                                        return null;
                                }

                                var context = acquireContextResult.get(item.id);
                                if (!context)
                                {
                                        console.warn('Unable to update company %s, the sharejs context is missing',
                                                item.id);
                                }

                                // todo send real changes
                                var op = Object.keys(values).map(function (key)
                                {
                                        var val = values[key];
                                        if (key === 'logoFile')
                                        {
                                                return null;
                                        }

                                        // todo real value for od
                                        var od;
                                        if (typeof val === 'boolean')
                                        {
                                                od = false;
                                        }
                                        else if (typeof val === 'string')
                                        {
                                                od = '';
                                        }
                                        else if (typeof val === 'number')
                                        {
                                                od = 0;
                                        }
                                        else if (Array.isArray(val))
                                        {
                                                od = [];
                                        }
                                        else if (val === null)
                                        {
                                                od = null;
                                        }
                                        else
                                        {
                                                od = {};
                                        }

                                        return {
                                                p : [key],
                                                od: od,
                                                oi: val
                                        };
                                }).filter(function (comp)
                                {
                                        return !!comp;
                                });

                                var logoPromise = P.resolve();
                                if (values.logoFile)
                                {
                                        logoPromise = UploadedImage.updateCompanyLogo(item.id, values.logoFile);
                                        values.logoFile = undefined;
                                }
                                return P.join(context.submitOpAsync(op), logoPromise);

                        }).bind(this).then(function ()
                        {
                                this.context.document.lastSave = new Date();
                        }).finally(done);
                });
        }.bind(this));

        // todo show message if no client side support
};

HomePageController.prototype._onStateSelectAddCompany = function(e)
{
        var Company = this.context.resource.Company;
        var pageView = this.parent.pageView;

        if (!this.context.user)
        {
                return;
        }

        if (e.state.length !== 3 ||
            e.state[0] !== 'page' ||
            e.state[1] !== 'home' ||
            e.state[2] !== 'submit')
        {
                return;
        }

        e.preventDefault();
        e.stopPropagation();

        P.using(this.context.document.savePendingDisposer(), function()
        {
                // make sure we are in the edit state
                return P.join(
                        this.state(['edit']),
                        Company.newEmptyCompany(this.parent.companyContexts),
                        function(nothing, company)
                        {
                                return company;
                        }
                ).bind(this)
                .then(function(company)
                {
                        var item = pageView.companyGrid.addCompany(company);
                        item.editing = true;

                        if (item.outerNode.scrollIntoView)
                        {
                                item.outerNode.scrollIntoView();
                        }

                })
                .catch(ga.logException);
        }.bind(this));
};

HomePageController.prototype._handleSubmitFormSubmit = function(e)
{
        var submitForm = this.submitForm;
        var CompanySubmit = this.context.resource.CompanySubmit;

        if (e.defaultPrevented)
        {
                return; // invalid user data
        }
        e.preventDefault();

        var faderState = this.getParentsStateList();
        faderState[faderState.length-1] = 'none';

        submitForm.setBusy();
        var data = submitForm.getAll();


        CompanySubmit.submit(data)
        .then(function()
        {
                submitForm.showThanks(faderState);
        })
        .catch(ga.logException)
        .catch(function(err)
        {
                submitForm.exceptionMessage.textContent =
                        'Sorry, something went wrong with your for submission';
                console.error(err);
        });
};

HomePageController.prototype.enterSubmit = function(state, upgrade)
{
        var context = this.context;
        var doc = context.document.document;
        var user = context.user;
        var pageView = this.parent.pageView;
        var CompanySubmit = context.resource.CompanySubmit;

        if (upgrade)
        {
                this.submitForm = pageView.assertSelector('> .SubmitForm', SubmitForm, context.router);
                this.submitForm.on('submit', this._handleSubmitFormSubmit, false, this);
                return;
        }

        var faderState = this.getParentsStateList();
        faderState[faderState.length-1] = 'none';
        context.document.faderState = faderState;


        var submitForm = new SubmitForm(
                doc,
                context.router,
                context.csrfToken,
                !user // do not show the submitter fields if a user is logged in
        );

        this.submitForm = submitForm;
        pageView.appendChild(submitForm);
        submitForm.attr('action', context.router.stringify(this.getParentsStateList()));

        if (context.csrfValid &&
            context.postData)
        {
                submitForm.setAll(context.postData);
                submitForm.cls('attemptedSubmit');
                if (submitForm.validate(true))
                {
                        submitForm.showThanks(faderState);
                        return CompanySubmit.submit(context.postData);
                }
        }

        submitForm.on('submit', this._handleSubmitFormSubmit, false, this);

        if (submitForm.outerNode.scrollIntoView)
        {
                submitForm.outerNode.scrollIntoView();
        }
};

HomePageController.prototype.leaveSubmit = function()
{
        this.submitForm.removeNode();
        this.context.document.faderState = null;
};
