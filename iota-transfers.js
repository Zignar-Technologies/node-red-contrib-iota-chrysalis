const iotajs = require('@iota/iota.js');
const TRAN = require('transliteration');
const convert = (from, to) => str => Buffer.from(str, from).toString(to);
const utf8ToHex = convert('utf8', 'hex');
const hexToUtf8 = convert('hex', 'utf8');
module.exports = function(RED) {
    function iotatransfers(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node._sec = 2;
	      node._firstroot = '';
        var iota_value = '';
        this.iotaNode = RED.nodes.getNode(config.iotaNode);

        const client = new iotajs.SingleNodeClient(this.iotaNode.host + ":" + this.iotaNode.port);
        node.readyIota = true;
        node.bech32HRP = "";
        async function run_health(callback) {
              await client.info()
                      .then(callback => {
                        //console.log("Health Node: ", callback);
                        if (callback.isHealthy) {
                          node.bech32HRP = callback.bech32HRP;
                          node.status({fill:"green",shape:"ring",text:"Heathy"});
                        } else {
                          node.bech32HRP = callback.bech32HRP;
                          node.status({fill:"red",shape:"ring",text:"Unhealthy"});
                        }
                      })
                      .catch(fail => {
                        //console.log("Health Node: ", callback);
                        node.status({fill:"red",shape:"ring",text:"NoConnected"});
                      });
                    return callback;
        }
        run_health();
        node.on('input', function(msg) {
            function isEmpty(val){
                return (val === undefined || val == null || val.length <= 0) ? true : false;
              }

            async function success(callback) {
              console.log("Done: ", callback);
              if (!isEmpty(callback.messageId)) {
                callback.TangleLink="https://explorer.iota.org/chrysalis/message/" + callback.messageId;
              }
              msg.payload=callback;
              self.send(msg);
              run_health();
              //return callback;
            }
            async function error(callback) {
              console.log("Fail: ", callback);
              console.error(callback);
              msg.payload=callback;
              self.send(msg);
              run_health();
              //return callback;
            }

            function see_args(callback) {
              console.log("inside see_args: ", msg);
              switch (config.iotaSelect) {
                case 'GetBalanceSeed':
                 callback = {
                   seedkey : (isEmpty(msg.payload.seedkey) ? (isEmpty(msg.payload) ? config.iotaSeedKey : msg.payload) : msg.payload.seedkey)
                 }
                break;
                case 'NewAddresses':
                  callback = {
                    seedkey : (isEmpty(msg.payload.seedkey) ? (isEmpty(msg.payload) ? config.iotaSeedKey : msg.payload) : msg.payload.seedkey),
                    num_addresses : (isEmpty(msg.payload.num_addresses) ? 1 : msg.payload.num_addresses)
                  }
                break;
                case 'SendTokens':
                  callback = {
                    seedkey : (isEmpty(msg.payload.seedkey) ? config.iotaSeedKey : msg.payload.seedkey),
                    addressto : (isEmpty(msg.payload.addressto) ? (isEmpty(config.iotaAddressTo) ? msg.payload : config.iotaAddressTo) : msg.payload.addressto),
                    amounttosend : (isEmpty(msg.payload.amounttosend) ? config.iotaValue : msg.payload.amounttosend),
                    messagekey : (isEmpty(msg.payload.messagekey) ? "node-red-contrib-iota-chrysalis" : msg.payload.messagekey),
                    messagedata : (isEmpty(msg.payload.messagedata) ? config.iotaMessage : msg.payload.messagedata)
                  }
                break;
              }
              return callback;
            }

            async function run_transfer(fromSeed,addressTo,amountToSend,messageKey,messageData) {
                    addr = addressTo;
                    if (!iotajs.Bech32Helper.matches(addr, node.bech32HRP)) {
                      ad = await client.addressEd25519(addr);
                      bech_ad = iotajs.Bech32Helper.toBech32(iotajs.ED25519_ADDRESS_TYPE, iotajs.Converter.hexToBytes(ad.address), node.bech32HRP);
                    } else {
                         ad = await client.address(addr);
                         bech_ad = addr;
                         };
                  //console.log("AddressTo Hex Bech32: ", ad.address, bech_ad);

                  //Prepare Wallet Seed
                  seed = fromSeed;
                  const walletSeed = new iotajs.Ed25519Seed(iotajs.Converter.hexToBytes(seed));
                  const walletPath = new iotajs.Bip32Path("m/44'/4218'/0'/0'/0'");
                  const walletAddressSeed = walletSeed.generateSeedFromPath(walletPath);
                  const walletEd25519Address = new iotajs.Ed25519Address(walletAddressSeed.keyPair().publicKey);
                  const newAddress = walletEd25519Address.toAddress();
                  const newAddressH = iotajs.Converter.bytesToHex(newAddress);
                  const newAddressHex = await client.addressEd25519(newAddressH);
                  const newAddressBech = iotajs.Bech32Helper.toBech32(iotajs.ED25519_ADDRESS_TYPE, newAddress, node.bech32HRP);
                  //console.log("Wallet Address From: ", newAddressHex, newAddressBech);

                  //Prepare Outputs to sendMultiple addresses
                  submitOutputs = [
                       { addressBech32: bech_ad,
                       amount: parseInt(amountToSend),
                       isDustAllowance: false }
                       ];
                   jsonOutputs = JSON.stringify(submitOutputs);
                   //console.log("Submit Output : ", typeof(submitOutputs), typeof(jsonOutputs), jsonOutputs);

                   amount = parseInt(amountToSend);

                   //Prepare Message Payload iotajs.Converter.utf8ToHex(messageKey.toString())
                   var submitMessage = {
                     key: messageKey.toString(),
                     data: JSON.stringify(messageData).toString()
                   };
                   //console.log("Submit Message : ", typeof(submitMessage), submitMessage);

                   await iotajs.send(client, walletSeed, 0, bech_ad, amount, submitMessage).then(success,error);
                   //await iotajs.sendMultiple(client, walletSeed,0, jsonOutputs, submitMessage).then(success,error);
             }

             async function run_getbalance(fromSeed) {
                   //Prepare Wallet Seed
                   const walletSeed = new iotajs.Ed25519Seed(iotajs.Converter.hexToBytes(fromSeed));
                   const walletBalance = await iotajs.getBalance(client, walletSeed, 0);
                   //console.log("Wallet Balance", walletBalance);
                   const allUnspentAddresses = await iotajs.getUnspentAddresses(client, walletSeed, 0);
                   //console.log("Wallet Unspent Addresses", allAddresses);
                   callback = { totalbalance : walletBalance, UnspentAddresses: allUnspentAddresses};
                   success(callback);
                   return callback;
             }

             async function run_newaddresses(fromSeed, num_addresses_to_create) {
                   //Prepare Wallet Seed
                   //console.log("inside run_newaddresses. Seed: ", fromSeed, "Num NewAddresses: ", num_addresses_to_create);
                   const walletSeed = new iotajs.Ed25519Seed(iotajs.Converter.hexToBytes(fromSeed));
                   const addressGeneratorAccountState = {
                        accountIndex: 0,
                        addressIndex: 0,
                        isInternal: false
                    };
                    const allUnspentAddresses = await iotajs.getUnspentAddresses(client, walletSeed, 0);
                    allNewAddresses = [];
                    //console.log("Calculated AllUnspentAddresses: ",allUnspentAddresses);
                    function is_Unspent(addr) {
                            is = false;
                            for (let x = 0; x < allUnspentAddresses.length; x++) {
                                    if (allUnspentAddresses[x].address === addr) {
                                     is = true;
                                     x = allUnspentAddresses.length }
                            }
                            return is;
                    }
                    for (let i = 0; allNewAddresses.length < num_addresses_to_create; i++) {
                      const path = iotajs.generateBip44Address(addressGeneratorAccountState, i === 0);
                      const addressSeed = walletSeed.generateSeedFromPath(new iotajs.Bip32Path(path));
                      const addressKeyPair = addressSeed.keyPair();
                      const indexEd25519Address = new iotajs.Ed25519Address(addressKeyPair.publicKey);
                      const indexPublicKeyAddress = indexEd25519Address.toAddress();
                      addressHex = iotajs.Converter.bytesToHex(indexPublicKeyAddress);
                      addressBech32 = iotajs.Bech32Helper.toBech32(iotajs.ED25519_ADDRESS_TYPE, indexPublicKeyAddress, node.bech32HRP);
                      if (!is_Unspent(addressBech32)) {
                        allNewAddresses[allNewAddresses.length] = { "address" : addressHex,
                          "addressBech32" : addressBech32,
                          "path" : path,
                          "keyPair" : addressKeyPair
                        }
                      } else {
                          //i--;
                        }
                   }
                  //console.log("All ", num_addresses_to_create, "New Addresses: ", allNewAddresses);
                  success(allNewAddresses);
                  return allNewAddresses;
             }

            if (this.readyIota) {
              console.log("Running iota-transfers...", msg);
              this.readyIota = false;
              var self = this;
              node.status({fill:"blue",shape:"ring",text:config.iotaSelect});
              switch (config.iotaSelect){
                case 'GetBalanceSeed':
                  args = see_args();
                  run_getbalance(args.seedkey);
	                break;
                case 'NewAddresses':
                  args = see_args();
                  //fromSeed = config.iotaSeedKey;
                  //num_addresses = 1;
                  run_newaddresses(args.seedkey,args.num_addresses);
                  break;
                case 'SendTokens':
                  args = see_args();
                  //fromSeed = config.iotaSeedKey;
                  //addressTo = config.iotaAddressTo;
                  //amountToSend = config.iotaValue;
                  //messageKey = "node-red-contrib-iota-Chrysalis";
                  //messageData = config.iotaMessage;
                  console.log("after see_args: ", args);
                  run_transfer(args.seedkey, args.addressto, args.amounttosend, args.messagekey, args.messagedata);
                  break;
                }
                //this.status(orig_status);
		            this.readyIota = true;
            }
        });
    }
    RED.nodes.registerType("iotatransfers",iotatransfers);
}
