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

//var P = require('bluebird');
var clone = require('clone');

var Controller = require('./Controller');
var HomePageController = require('./HomePageController');
var CompanyDetailPageController = require('./CompanyDetailPageController');
var swissarmyknife = require('../swissarmyknife');

var HomePage = require('../view/page/HomePage');
var CompanyDetailPage = require('../view/page/CompanyDetailPage');


function PageController(context)
{
        Controller.call(this, context);

        this.pageView = null;
        this.homePageController = new HomePageController(context);
        this.companyDetailController = new CompanyDetailPageController(context);
        this.dummyController = new Controller.Dummy(this.context);

        this.companyContexts = null;
}

require('inherits')(PageController, Controller);
module.exports = PageController;

PageController.prototype.leave = function()
{
        if (this.companyContexts)
        {
                this.companyContexts.then(function(context)
                {
                        context.destroy();
                });
                this.companyContexts = null;
        }

        if (this.pageView)
        {
                this.pageView.removeNode();
                this.pageView = null;
        }
};

PageController.prototype._companyAcquireContexts = function(ids)
{
        var Company = this.context.resource.Company;

        var acquire = ids
                ? Company.acquireContexts(ids)
                : Company.acquireAllContexts();

        this.companyContexts = acquire
        .bind(this)
        .then(function(acquireContextResult)
        {
                acquireContextResult.addListener(this._onCompanyOp.bind(this));
                return acquireContextResult;
        });

        return this.companyContexts;
};

PageController.prototype._onCompanyOp = function(id, snapshot, components, keys)
{
        // todo really apply operations

        var set = {};

        keys.forEach(function(key)
        {
                set[key] = snapshot[key];
        });

        if (this.currentState === 'home')
        {
                console.info('Applying new data for keys ', keys, 'on company', id);

                var companyItem = this.pageView.companyGrid.companiesById[id];
                if (!companyItem)
                {
                        return;
                }

                companyItem.setValues(set);
        }
        else if (this.currentState.type === 'NamedEntity' &&
                 this.pageView &&
                 this.pageView.id === id)
        {
                console.info('Applying new data for keys ', keys, 'on company', id);

                if ('namedEntityId' in set)
                {
                        var namedEntityState = new this.context.router.NamedEntity(set.namedEntityId || id);
                        var states = this.getFullStateListAndReplace(namedEntityState);
                        this.context.replaceState(states);
                }

                this.pageView.setValues(set);
        }
};

PageController.prototype.enterHome = function(state, upgrade)
{
        var doc = this.context.document;
        var Company = this.context.resource.Company;

        this.child = this.homePageController;

        if (upgrade)
        {
                this.pageView = doc.assertSelector('> .HomePage', HomePage, this.context.router);
                return this._companyAcquireContexts();
        }

        var allCompaniesPromise = this.context.server
                ? Company.all()
                : this._companyAcquireContexts().get('allSnapshots');

        return allCompaniesPromise.then(function(companies)
        {
                companies = clone(companies, false, 1);
                swissarmyknife.sortByStringProperty(companies, 'name');
                var homePage = new HomePage(doc.document, this.context.router);
                homePage.companyGrid.addCompany(companies);
                homePage.companyGrid.addPlaceholder();

                this.pageView = homePage;
                doc.appendChild(homePage);
                doc.title = homePage.title + ' :: DealPort.co';
        }.bind(this));
};

PageController.prototype.enterNamedEntity = function(namedEntityState, upgrade)
{
        var Company = this.context.resource.Company;
        var NamedEntity = this.context.resource.NamedEntity;
        var doc = this.context.document;
        // Determine which page to display based on the matching entity

        // make sure we have a child in case the named entity is not found
        this.child = this.dummyController;

        if (upgrade)
        {
                this.pageView = doc.selector('> .notFound');
                if (this.pageView)
                {
                        return null;
                }

                this.pageView = doc.selector('> .CompanyDetailPage', CompanyDetailPage, this.context.router);
                if (this.pageView)
                {
                        // company
                        this.child = this.companyDetailController;
                        return this._companyAcquireContexts([this.pageView.id]).get('allSnapshots').get('0');
                }

                // todo also try user here

                throw Error('Unable to match a Page view');
        }

        return NamedEntity.byName(namedEntityState.name)
        .bind(this)
        .then(function(named)
        {
                if (named && named.company)
                {
                        return [named,
                                this.context.server
                                ? Company.ids([named.company]).get(0)
                                : this._companyAcquireContexts([named.company]).get('allSnapshots').get('0')
                        ];
                }

                return [named, null];
        })
        .spread(function(named, entity)
        {
                if (!named ||
                    !named.company ||
                    !entity)
                {
                        if (named)
                        {
                                // database inconsistency
                                console.error('Found NamedEntity however the entity it references does not exist!', named);
                        }
                        // todo 404 header
                        this.pageView = doc.create('p', 'notFound', 'Route not found');
                        doc.appendChild(this.pageView);
                        return;
                }

                if (named.company)
                {
                        doc.title = entity.name + ' :: DealPort.co';
                        this.child = this.companyDetailController;
                        this.pageView = new CompanyDetailPage(doc.document, this.context.router, entity);
                        doc.appendChild(this.pageView);
                }
                else if (named.user)
                {
                        // todo
                }
        });

};