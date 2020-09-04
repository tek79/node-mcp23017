var REGISTER_GPIOA = 0x00,
    REGISTER_GPIOB = 0x01,
    REGISTER_GPIOA_PULLUP = 0x0C,
    REGISTER_GPIOB_PULLUP = 0x0D,
    READ_GPIOA_ADDR = 0x12,
    READ_GPIOB_ADDR = 0x13,
    WRITE_GPIOA_ADDR = 0x14,
    WRITE_GPIOB_ADDR = 0x15,
    Wire = require('i2c-bus');

var MCP23017 = (function () {
    MCP23017.prototype.HIGH = 1;
    MCP23017.prototype.LOW = 0;
    MCP23017.prototype.INPUT_PULLUP = 2;
    MCP23017.prototype.INPUT = 1;
    MCP23017.prototype.OUTPUT = 0;

    MCP23017.prototype.address = 0x20; //if the mcp has all adress lines pulled low

    MCP23017.prototype.dirAState = 0xff; //initial state of GPIO A bank
    MCP23017.prototype.dirBState = 0xff; //initial state of GPIO B bank

    MCP23017.prototype.dirAPullUpState = 0x0; //initial state of GPIO A pull up resistor state
    MCP23017.prototype.dirBPullUpState = 0x0; //initial state of GPIO B pull up resistor state

    MCP23017.prototype.gpioAState = 0x0; //initial state of GPIOS A
    MCP23017.prototype.gpioBState = 0x0; //initial state of GPIOS B

    function MCP23017(config) {
        this.address = config.address;
        this.mode = this.INPUT;
        this.debug = config.debug === true;
        this.deviceFilename = config.device !== null ? config.device : '/dev/i2c-1';

        var busPrefix = '/dev/i2c-';
        this.deviceIndex = parseInt(this.deviceFilename.replace(busPrefix, ''));
        if (!this.deviceIndex || isNaN(this.deviceIndex)) {
            throw new Error('Invalid i2c device filename');
        }

        this.wire = Wire.openSync(this.deviceIndex);
    }

    MCP23017.prototype.init = function (callback) {
        this._initGpioA((err) => {
            if (err) {
                return callback(err);
            }

            this._initGpioB((err) => {
                    if (err) {
                        return callback(err);
                    }

                    callback(null);
                });
        });

    };

    //inits both registers as an input
    MCP23017.prototype.reset = function (callback) {
        this.dirBState = 0xff;
        this.dirAState = 0xff;
        this.init(callback);
    };

    /*
      sets an pin as an INPUT or OUTPUT
    */
    MCP23017.prototype.pinMode = function (pin, direction, callback) {
        if (direction !== this.INPUT && direction !== this.INPUT_PULLUP && direction !== this.OUTPUT) {
            throw new Error('invalid direction value');
        }
        if (isNaN(pin)) {
            throw new Error('pin is not a number');
        } else if (pin > 15 || pin < 0) {
            throw new Error('invalid pin number' + pin);
        }

        //delegate to function that handles low level stuff
        this._setGpioDir(
            pin >= 8 ? pin - 8 : pin,
            direction,
            pin >= 8 ? REGISTER_GPIOB : REGISTER_GPIOA,
            pin >= 8 ? REGISTER_GPIOB_PULLUP : REGISTER_GPIOA_PULLUP,
            callback
        );
    };

    /*
      internally used to set the direction registers
    */
    MCP23017.prototype._setGpioDir = function (pin, dir, registerDirection, registerPullUp, callback) {
        var pinHexMask = Math.pow(2, pin),
            registerDir,
            registerPullUpDir;

        if (registerDirection === REGISTER_GPIOA) {
            registerDir = this.dirAState;
            if (dir === this.OUTPUT) {
                if ((this.dirAState & pinHexMask) === pinHexMask) {
                    this.log('setting pin \'' + pin + '\' as an OUTPUT');
                    this.dirAState = this.dirAState ^ pinHexMask;
                    registerDir = this.dirAState;
                } else {
                    this.log('pin \'' + pin + '\' already an OUTPUT');
                }
            } else if (dir === this.INPUT || dir === this.INPUT_PULLUP) {
                if ((this.dirAState & pinHexMask) !== pinHexMask) {
                    this.log('setting pin \'' + pin + '\' as an INPUT');
                    this.dirAState = this.dirAState ^ pinHexMask;
                    registerDir = this.dirAState;
                } else {
                    this.log('pin \'' + pin + '\' already an INPUT');
                }
                if (dir === this.INPUT_PULLUP) {
                    registerPullUpDir = this.dirAPullUpState;
                    if ((this.dirAPullUpState & pinHexMask) !== pinHexMask) {
                        this.log('activate INPUT_PULLUP for pin \'' + pin + '\'');
                        this.dirAPullUpState = this.dirAPullUpState ^ pinHexMask;
                        registerPullUpDir = this.dirAPullUpState;
                    } else {
                        this.log('pin \'' + pin + '\' already activated INPUT_PULLUP');
                    }
                }
            }
        } else if (registerDirection === REGISTER_GPIOB) {
            registerDir = this.dirBState;
            if (dir === this.OUTPUT) {
                if ((this.dirBState & pinHexMask) === pinHexMask) {
                    this.log('setting pin \'' + pin + '\' as an OUTPUT');
                    this.dirBState = this.dirBState ^ pinHexMask;
                    registerDir = this.dirBState;
                } else {
                    this.log('pin \'' + pin + '\' already an OUTPUT');
                }
            } else if (dir === this.INPUT || dir === this.INPUT_PULLUP) {
                if ((this.dirBState & pinHexMask) !== pinHexMask) {
                    this.log('setting pin \'' + pin + '\' as an INPUT');
                    this.dirBState = this.dirBState ^ pinHexMask;
                    registerDir = this.dirBState;
                } else {
                    this.log('pin \'' + pin + '\' already an INPUT');
                }
                if (dir === this.INPUT_PULLUP) {
                    registerPullUpDir = this.dirBPullUpState;
                    if ((this.dirBPullUpState & pinHexMask) !== pinHexMask) {
                        this.log('activate INPUT_PULLUP for pin \'' + pin + '\'');
                        this.dirBPullUpState = this.dirBPullUpState ^ pinHexMask;
                        registerPullUpDir = this.dirBPullUpState;
                    } else {
                        this.log('pin \'' + pin + '\' already activated INPUT_PULLUP');
                    }
                }
            }
        }

        this._send(registerDirection, [registerDir], (err) => {
            if (err) {
                if (typeof callback !== 'function') {
                    throw err;
                }
                return callback(err);
            }
            this.log('pin:  ' + pin + ', register: ' + registerDirection + ', value: ' + registerDir);

            if (registerPullUpDir !== undefined) {
                this._send(registerPullUp, [registerPullUpDir], (err) => {
                    if (err) {
                        if (typeof callback !== 'function') {
                            throw err;
                        }
                        return callback(err);
                    }

                    this.log('pin:  ' + pin + ', register: ' + registerPullUp + ', pull up value: ' + registerPullUpDir);
                    callback && callback(null);
                });
            }
        });
    };

    MCP23017.prototype._setGpioAPinValue = function (pin, value, callback) {
        var pinHexMask = Math.pow(2, pin);
        if (value === 0) {
            if ((this.gpioAState & pinHexMask) === pinHexMask) {
                this.gpioAState = this.gpioAState ^ pinHexMask;
                this._send(WRITE_GPIOA_ADDR, [this.gpioAState], callback);
            } else {
                callback && setImmediate(()=>callback(null));
            }
        }
        else if (value === 1) {
            if ((this.gpioAState & pinHexMask) !== pinHexMask) {
                this.gpioAState = this.gpioAState ^ pinHexMask;
                this._send(WRITE_GPIOA_ADDR, [this.gpioAState], callback);
            } else {
                callback && setImmediate(()=>callback(null));
            }
        } else {
            callback && setImmediate(() => {
                callback(new Error('Invalid value'));
            });
        }
    };

    MCP23017.prototype._setGpioBPinValue = function (pin, value, callback) {
        var pinHexMask = Math.pow(2, pin);
        if (value === 0) {
            if ((this.gpioBState & pinHexMask) === pinHexMask) {
                this.gpioBState = this.gpioBState ^ pinHexMask;
                this._send(WRITE_GPIOB_ADDR, [this.gpioBState], callback);
            } else {
                callback && setImmediate(()=>callback(null));
            }
        } else if (value === 1) {
            if ((this.gpioBState & pinHexMask) !== pinHexMask) {
                this.gpioBState = this.gpioBState ^ pinHexMask;
                this._send(WRITE_GPIOB_ADDR, [this.gpioBState], callback);
            } else {
                callback && setImmediate(()=>callback(null));
            }
        } else {
            setImmediate(() => {
                callback && callback(new Error('Invalid value'));
            });
        }
    };

    var allowedValues = [0, 1, true, false];
    MCP23017.prototype.digitalWrite = function (pin, value, callback) {
        if (allowedValues.indexOf(value) < 0) {
            throw new Error('invalid value');
        } else if (value === false) {
            value = this.LOW;
        } else if (value === true) {
            value = this.HIGH;
        }

        if (isNaN(pin)) {
            throw new Error('pin is not a number');
        } else if (pin > 15 || pin < 0) {
            throw new Error('invalid pin number:' + pin);
        } else if (pin < 8) {
            //Port A
            this._setGpioAPinValue(pin, value, callback);
        } else {
            //Port B
            pin -= 8;
            this._setGpioBPinValue(pin, value, callback);
        }
    };

    MCP23017.prototype.digitalRead = function (pin, callback) {
        var register = pin >= 8 ? READ_GPIOB_ADDR : READ_GPIOA_ADDR; //get the register to read from
        pin = pin >= 8 ? pin - 8 : pin; //remap the pin to internal value
        var pinHexMask = Math.pow(2, pin); //create a hexMask

        //read one byte from the right register (A or B)
        this._read(register, function (err, registerValue) {
            if (err) {
                callback(err, null);
            } else if ((registerValue & pinHexMask) === pinHexMask) {
                //Check if the requested bit is set in the byte returned from the register
                callback(null, true);
            } else {
                callback(null, false);
            }
        });

    };

    MCP23017.prototype._initGpioA = function (callback) {
        //Set Direction to Output
        this._send(REGISTER_GPIOA, [this.dirAState], (err) => {
            if (err) {
                return callback(err);
            }

            //clear all output states
            this._send(WRITE_GPIOA_ADDR, [0x0], (err) => {
                if (err) {
                    return callback(err);
                }

                callback(null);
            });
        });
    };

    MCP23017.prototype._initGpioB = function (callback) {
        //Set Direction to Output
        this._send(REGISTER_GPIOB, [this.dirBState], (err) => {
            if (err) {
                return callback(err);
            }

            //clear all output states
            this._send(WRITE_GPIOB_ADDR, [0x0], (err) => {
                if (err) {
                    return callback(err);
                }

                callback(null);
            });
        });

    };

    MCP23017.prototype._send = function (cmd, values, callback) {
        this.wire.writeByte(this.address, cmd, values[0], function (err) {
            if (err) {
                if (typeof callback !== 'function') {
                    throw err;
                }
                return callback(err);
            }

            typeof callback === 'function' && callback(null);
        });
    };

    MCP23017.prototype._read = function (cmd, callback) {
        this.wire.readByte(this.address, cmd, function (err, res) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, res);
            }
        });
    };

    MCP23017.prototype.log = function (msg) {
        if (this.debug) {
            console.log(msg);
        }
    };

    return MCP23017;

})();

module.exports = MCP23017;
