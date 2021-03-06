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
var domv = require('domv');

var CompanyHeader = require('./CompanyHeader');
var EditableBooleanText = require('./editing/EditableBooleanText');

require('static-reference')('./style/CompanyGridItem.less');

function CompanyGridItem(node, router, company)
{
        domv.Component.call(this, node, 'li');
        this.router = router;

        if (this.isCreationConstructor(node))
        {
                this.cls('CompanyGridItem');

                var div = this.shorthand('div');

                this.attr('data-id', company._id);

                this.appendChild(
                        this.header = new CompanyHeader(this.document, router, company),
                        div('bottomButtons',
                                this.visible = new EditableBooleanText(this.document, company.visible, '✗ hidden', '✓ visible').cls('visible')
                        )
                );

                if (company.editableByCurrentUser)
                {
                        this.cls('canEdit');
                }
                else
                {
                        this.visible.style.display = 'none';
                }
        }
        else
        {
                this.assertHasClass('CompanyGridItem');
                this.header = this.assertSelector('> .CompanyHeader', CompanyHeader, router);
                this.visible = this.assertSelector('> .bottomButtons > .visible', EditableBooleanText);
        }

        this.on('click', this._onClick);
}

module.exports = CompanyGridItem;
require('inherits')(CompanyGridItem, domv.Component);

// (not using get/set for this because only a subset of company is stored here)
CompanyGridItem.prototype.setValues = function(company)
{
        if ('visible' in company)
        {
                this.visible.value = company.visible;
        }

        this.header.setValues(company);
};

CompanyGridItem.prototype.getValues = function(since)
{
        var values = this.header.getValues(since) || {};

        if (this.visible.isChangedByUserSince(since))
        {
                values.visible = this.visible.value;
        }

        return Object.keys(values).length ? values : null;
};

Object.defineProperty(CompanyGridItem.prototype, 'id', {
        get: function()
        {
                return this.getAttr('data-id');
        }
});

Object.defineProperty(CompanyGridItem.prototype, 'canEdit', {
        get: function()
        {
                return this.hasClass('canEdit');
        },
        set: function(value)
        {
                return this.toggleClass('canEdit', value);
        }
});

Object.defineProperty(CompanyGridItem.prototype, 'editing', {
        configurable: true,
        get: function()
        {
                return this.hasClass('editing');
        },
        set: function(value)
        {
                value = !!value;
                this.toggleClass('editing', value);
                this.header.editing = value;
                this.visible.editing = value;
        }
});

CompanyGridItem.prototype._onClick = function(e)
{
        if (this.editing)
        {
                return;
        }

        if (domv.isLeftMouseButton(e))
        {
                if (this.header.titleLink.trigger())
                {
                        e.preventDefault();
                }
        }
};
