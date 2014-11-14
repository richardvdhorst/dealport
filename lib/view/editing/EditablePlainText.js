'use strict';
var domv = require('domv');
var escapeHtml = require('bloody-escapehtml');
var swissarmyknife = require('../../swissarmyknife');

require('static-reference')('./style/EditablePlainText.less');

function preventListener(e)
{
        e.preventDefault();
}

function EditablePlainText(node, tagName, multiline, value)
{
        domv.Component.call(this, node, tagName || 'div');

        if (this.isCreationConstructor(node))
        {
                this.cls('EditablePlainText');
                this.multiline = multiline;
                this.value = value;
        }
        else
        {
                this.assertHasClass('EditablePlainText');
                this.multiline = this.hasClass('multiline'); // adds listeners
        }

        this._fireChangeEvent = swissarmyknife.lazyTimeout(10, this._fireChangeEventImpl, this);

        this.on('paste', this._onPaste);
        this.on('cut', this._fireChangeEvent);
        this.on('input', this._fireChangeEvent);

        // dragging text/or images might mess up the DOM of this element,
        // it might also mess up the DOM of adjacent elements.
        this.on('drag', preventListener);
        this.on('dragend', preventListener);
        this.on('dragenter', preventListener);
        this.on('dragleave', preventListener);
        this.on('dragover', preventListener);
        this.on('dragstart', preventListener);
        this.on('drop', preventListener);
}

module.exports = EditablePlainText;
require('inherits')(EditablePlainText, domv.Component);

Object.defineProperty(EditablePlainText.prototype, 'multiline', {
        configurable: true,
        get: function()
        {
                return this.hasClass('multiline');
        },
        set: function(value)
        {
                value = !!value;
                this.toggleClass('multiline', value);
                this.toggleClass('singleline', !value);
                if (value)
                {
                        this.removeListener('keydown', this._singlelineOnKeydown);
                }
                else
                {
                        this.on('keydown', this._singlelineOnKeydown);
                }
        }
});

Object.defineProperty(EditablePlainText.prototype, 'editing', {
        configurable: true,
        get: function()
        {
                return this.hasClass('editing');
        },
        set: function(value)
        {
                value = !!value;
                this.toggleClass('editing', value);
                this.attr('contentEditable', value ? 'true' : 'false');
        }
});

EditablePlainText.prototype._fireChangeEventImpl = function()
{
        // not cancelable
        this.emit('domv-editable-change', {targetComponent: this}, true, false);
};

EditablePlainText.prototype._onPaste = function(e)
{
        var text;
        e.preventDefault();

        // filter all html
        if (this.editing)
        {
                if (e.clipboardData)
                {
                        text = e.clipboardData.getData('text/plain');// Sane browsers
                }
                else if (global.clipboardData)
                {
                        text = global.clipboardData.getData('Text'); // IE
                }
                else
                {
                        return;
                }

                text = escapeHtml(text);
                if (this.multiline)
                {
                        text = text.replace(/\r\n|[\r\n]/g, '<br/>'); // preserve enters
                }

                if (this.document.queryCommandSupported &&
                    this.document.queryCommandSupported('insertHTML'))
                {
                        this.document.execCommand('insertHTML', false, text);
                }
                else
                {
                        swissarmyknife.pasteHtmlAtCaret(global, text, false);
                }

                this._fireChangeEvent();
        }
};

EditablePlainText.prototype._singlelineOnKeydown = function(e)
{
        if (e.keyCode === 13) // enter key
        {
                e.preventDefault();
        }

        switch (e.keyCode)
        {
                case 0x12: // alt
                case 0x14: // caps lock
                case 0x11:  //ctrl
                case 0x5B: // OS
                case 0x5C: // OS
                case 0x5D: // OS / context menu
                case 0x10: // shift
                case 0x09: //tab
                case 0x23: // end
                case 0x24: // home
                case 0x22: // page down
                case 0x21: // page up
                case 0x28: // arrow down
                case 0x25: // arrow left
                case 0x27: // arrow right
                case 0x26: // arrow up
                case 0x1B: // escape
                case 0x70: // F1
                case 0x71:
                case 0x72:
                case 0x73:
                case 0x74:
                case 0x75:
                case 0x76:
                case 0x77:
                case 0x78:
                case 0x79:
                case 0x7A:
                case 0x7B: // F12
                                break;
                default:
                        this._fireChangeEvent();
        }
};

Object.defineProperty(EditablePlainText.prototype, 'value', {
        configurable: true,
        get: function()
        {
                var value = '';
                if (this.multiline)
                {
                        // (this does not work properly for things like <p><br/></p>,
                        //  however this is not something that should normally occur)
                        this.childNodes.forEach(function(node)
                        {
                                if (node.outerNodeType === domv.NodeType.ELEMENT)
                                {
                                        if (node.outerNodeName === 'br')
                                        {
                                                value += '\n';
                                        }
                                        else
                                        {
                                                value += node.textContent;
                                        }
                                }
                                else if (node.outerNodeType === domv.NodeType.TEXT)
                                {
                                        value += node.textContent;
                                }
                        });

                        return value;
                }
                else
                {
                        return this.textContent;
                }
        },
        set: function(value)
        {
                value = value.toString();

                if (this.multiline)
                {
                        this.removeChildren();
                        var lines = value.split(/\r\n|\r|\n/);

                        lines.forEach(function(line, index)
                        {
                                if (index)
                                {
                                        this.appendChild(this.create('br'));
                                }

                                this.appendChild(line);
                        }, this);
                }
                else
                {
                        this.textContent = value.replace(/[\r\n]/g, ' ');
                }
        }
});