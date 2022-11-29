/*******************************************************************************
 *
 * Script Name: Coupa Vendor Integration
 *
 * Script Type: User Event
 *
 * Description: This integration is called when a vendor record is either created or updated in Netsuite
 * and based on that it creates/updates vendors in Coupa
 *
 * Script Id: customscript_coupa_vend_integration
 *
 * Version    Date            Author            Remarks
 * 1.0     Jul 15, 2022 Ravi Shankar Bandaru   
 *
 ********************************************************************************/
var context = nlapiGetContext();
var oidcHeader = getAPIHeader('text/xml'); //NIB# 331 Get OIDC API Header

var headers = new Array();
if (oidcHeader) {
    headers = oidcHeader;
  nlapiLogExecution('DEBUG', 'oidcHeader  ', oidcHeader.Authorization);
} 
/**
 * The recordType (internal id) corresponds to the "Applied To" record in your
 * script deployment.
 * 
 * @appliedtorecord recordType
 * 
 * @param {String}
 *            type Operation types: create, edit, delete, xedit, approve,
 *            cancel, reject (SO, ER, Time Bill, PO & RMA only) pack, ship (IF
 *            only) dropship, specialorder, orderitems (PO only) paybills
 *            (vendor payments)
 * @returns {Void}
 */
function userEventAfterSubmit(type) {
    var companyFaxNum = "",
        companyMobileNum = "";
    var isCreateMode = type == 'create' ? true : false; //Boolean flag for create Event Type

    nlapiLogExecution('AUDIT', 'Vendor Integration Script Called ', 'type = ' +
        type + ' recordid = ' + nlapiGetRecordId());

    var thisEnv = context.getEnvironment();
    var url_test_contains = ["-train", "-dev", "-demo", "-dmo", "-qa", "-sandbox",
        "-sbx", "-stage", "-staging", "-stg", "-support", "-test", "-uat",
        "coupacloud.com", "coupadev.com"
    ];
    var param_url = nlapiGetContext().getSetting('SCRIPT',
        'custscript_coupa_oidc_client_url');
    // Ensure test url in a non production environment.
     var clientURL = context.getSetting('SCRIPT', 'custscript_coupa_oidc_client_url');
     nlapiLogExecution('AUDIT', 'VclientURL ', clientURL);
    try {
        if (thisEnv != 'PRODUCTION') {
            var test_url = false;
            for (var i = 0; i < url_test_contains.length; i++) {
                if (param_url.indexOf(url_test_contains[i]) > -1) {
                    test_url = true;
                }
            }
            if (!test_url) {
                var errMsg = 'Error - script is running in non prod environment and not using a ' +
                    url_test_contains +
                    ' in the coupa URL. If you believe this to be incorrect, please contact Coupa Support';
                throw nlapiCreateError('BadEnv', errMsg, false);
            }
        }
    } catch (error) {
        var errordetails;
        errorcode = error.getCode();
        errordetails = error.getDetails() + ".";

        nlapiLogExecution(
            'ERROR',
            'Processing Error - Unable to do Coupa request api call to export Invoices',
            'Error Code = ' + errorcode + ' Error Description = ' +
            errordetails);
        nlapiSendEmail(991, ['VendorMgmt@genesys.com', 'Apps-Dev-Team@genesys.com'], context.getSetting(
                'SCRIPT', 'custscript_vendor_accountname') +
            ' - Error creating/Updating Supplier in Coupa, Error Code:' +
            errorcode + '\n' + 'Error Message:' + errordetails);
        throw error;
    }


    var Isinactive = false;

    if (context
        .getSetting('SCRIPT', 'custscript_vendor_customfieldincludeonly')) {
        var custfieldincludeonly = context.getSetting('SCRIPT',
            'custscript_vendor_customfieldincludeonly');
        var newrecord = nlapiGetNewRecord();
        var oldrecord = nlapiGetOldRecord();

        if (type == 'create') {
            if (newrecord.getFieldValue(custfieldincludeonly) == 'F' ||
                newrecord.getFieldValue(custfieldincludeonly) != 'T') {
                nlapiLogExecution(
                    'AUDIT',
                    'Skipping Vendor creation - - as DO NOT INCLUDE in COUPA set',
                    'Vendor = ' + newrecord.getFieldValue('entityid') +
                    ' VendorId = ' + nlapiGetRecordId());
                return;
            }
        }

        if (type == 'edit' || type == 'xedit') {
            if (newrecord.getFieldValue(custfieldincludeonly) == 'F' &&
                oldrecord.getFieldValue(custfieldincludeonly) != 'F') {
                Isinactive = true;
            }
            if (newrecord.getFieldValue(custfieldincludeonly) == 'F' &&
                oldrecord.getFieldValue(custfieldincludeonly) == 'F') {
                nlapiLogExecution(
                    'AUDIT',
                    'Skipping Vendor update - as DO NOT INCLUDE in COUPA set',
                    'Vendor = ' + newrecord.getFieldValue('entityid') +
                    ' VendorId = ' + nlapiGetRecordId());
                return;
            }
        }

        if (type == 'delete') {
            Isinactive = true;
        }
    }

    var recordid = nlapiGetRecordId();
    var formatno = context.getSetting('SCRIPT',
        'custscript_vendor_phonefaxformat');
    var invoicematchlevel = context.getSetting('SCRIPT',
        'custscript_vendor_invoicematchlevel');
    var paymentmethod = context.getSetting('SCRIPT',
        'custscript_vendor_paymentmethod');
    var invoiceemails = context.getSetting('SCRIPT',
        'custscript_vendor_invoice_emails');
    nlapiLogExecution('DEBUG', 'Invoiceemail = ', invoiceemails);
    var sendinvoicestoapprov = context.getSetting('SCRIPT',
        'custscript_vendor_sendinvoices_to_approv');
    var allowinvocingfromcsn = context.getSetting('SCRIPT',
        'custscript_vendor_allowinvoicing_frm_csn');
    var displayname = context.getSetting('SCRIPT',
        'custscript_vendor_use_display_name');
    var skipphonenum = context.getSetting('SCRIPT', 'custscript_vendor_skipphonenum');
    if (!skipphonenum) {
        skipphonenum = 'F'
    }
    var splitvalue = '-';

    var record;
    if (type == 'delete') {
        record = nlapiGetOldRecord();
    } else {
        record = nlapiLoadRecord('vendor', recordid);
    }

    var gen_vendor_id = record.getFieldValue('entityid');
    var gen_vendor_id_number = gen_vendor_id.substr(0, gen_vendor_id.indexOf(' '));
    nlapiLogExecution('DEBUG', 'gen_vendor_id_number = ', gen_vendor_id_number);
    var gen_vendor_id_name = gen_vendor_id.substr(gen_vendor_id.indexOf(' ') + 1);
    nlapiLogExecution('DEBUG', 'gen_vendor_id_name = ', gen_vendor_id_name);
    var gen_subsidiary = record.getFieldValue('custentity_genesys_entity_number');
    var companyName = record.getFieldValue('companyname');
    var stri_result = gen_vendor_id.match(gen_subsidiary);
    if (stri_result == null) {
        if (gen_vendor_id_number != '' && gen_vendor_id_number != null) {
            var genesys_supplier_name = gen_vendor_id_number + '-' + gen_subsidiary + ' ' + gen_vendor_id_name;
        } else {
            var genesys_supplier_name = gen_vendor_id_name + '-' + gen_subsidiary + ' ' + companyName;
        }
    } else if (stri_result != null) {
        var genesys_supplier_name = gen_vendor_id;
    }

    // nlapiLogExecution('DEBUG','after getting api key');

    var externalid = '';
    var response_status = '';
    var iTimeOutCnt = 0;

    // loop start
    for (var k = 0; k < 1; k++) {

        try {
            nlapiLogExecution('DEBUG', 'Execution context', nlapiGetContext().getExecutionContext());
            var supplierId = getCoupaSupplier(record.getFieldValue('entityid'),
                recordid, nlapiGetContext().getSetting('SCRIPT',
                    'custscript_coupa_oidc_client_url'), headers, record);

            var url = nlapiGetContext().getSetting('SCRIPT',
                    'custscript_coupa_oidc_client_url') +
                '/api/suppliers?bulk=1';

            nlapiLogExecution('DEBUG', 'after getting URL', '|' + url + '|');

            var postData = "<?xml version='1.0' encoding='UTF-8'?>" +
                "<suppliers><supplier>";

            if (supplierId != null && supplierId != "") {
                url = nlapiGetContext().getSetting('SCRIPT',
                        'custscript_coupa_oidc_client_url') +
                    '/api/suppliers/' + supplierId + '?bulk=1';
                postData = "<?xml version='1.0' encoding='UTF-8'?><supplier><id>" +
                    supplierId + "</id>";
                nlapiLogExecution('DEBUG', 'after setting ID', postData);
                nlapiLogExecution('DEBUG', 'after setting ID', url);
            }
            postData = postData + "<name>" +
                convertCDATA(genesys_supplier_name) +
                "</name>";

            if (displayname == 'T' && record.getFieldValue('companyname') != null) {
                postData = postData + "<display-name>" +
                    convertCDATA(genesys_supplier_name) +
                    "</display-name>";
            }

            var out_status;

            if (record.getFieldValue('isinactive') == 'T' || Isinactive == true) {
                out_status = "inactive";
            } else {
                out_status = "active";
            }

            nlapiLogExecution('DEBUG', 'after validating active inactive');

            postData = postData + "<status>" + out_status + "</status>";

            //220 line added by Ravi on June 7th -2022.
            nlapiLogExecution('DEBUG', record.getFieldValue('entityid'));

            postData = postData + "<genesys-supplier-name>" + record.getFieldValue('entityid') + "</genesys-supplier-name>";

            if (record.getFieldText('terms')) {
                postData = postData + "<payment-term>" + "<code>" +
                    record.getFieldText('terms') + "</code>" +
                    "</payment-term>";
            }

            nlapiLogExecution('DEBUG', 'after payment terms');


            var firstname, lastname, contactEmail;

            if (record.getFieldValue('isperson') == 'T') {
                firstname = record.getFieldValue('firstname');
                lastname = record.getFieldValue('lastname');
                contactEmail = record.getFieldValue('email');

            } else {
                var vendorEmail = record.getFieldValue('email');
                if (vendorEmail != '' && vendorEmail != null) {
                    contactEmail = record.getFieldValue('email');
                } //new code to check if phone num exists

                var filters = new Array();
                filters.push(new nlobjSearchFilter('company', null, 'anyof',
                    recordid));

                var columns = new Array();
                columns.push(new nlobjSearchColumn('firstname'));
                columns.push(new nlobjSearchColumn('lastname'));
                columns.push(new nlobjSearchColumn('phone'));
                columns.push(new nlobjSearchColumn('email'));
                columns.push(new nlobjSearchColumn('mobilephone'));
                columns.push(new nlobjSearchColumn('fax'));
                nlapiLogExecution('DEBUG', 'before primary contact search');
                var res = nlapiSearchRecord('contact',
                    null, filters,
                    columns);

                nlapiLogExecution('DEBUG', 'after primary contact search', res);
                var searchresult;
                for (var i = 0; res != null && i < res.length; i++) {
                    searchresult = res[i];
                    firstname = searchresult.getValue('firstname');
                    lastname = searchresult.getValue('lastname');
                    contactEmail = searchresult.getValue('email');
                    var phoneNum = searchresult.getValue('phone');
                    companyMobileNum = searchresult.getValue('mobilephone');
                    companyFaxNum = searchresult.getValue('fax');

                }
            }
            // nlapiLogExecution('DEBUG','before companyprefereces');
            /**
             * once we find out how to enable nonadmin user role to do this var
             * phoneformat =
             * nlapiLoadConfiguration('companypreferences').getFieldValue('phoneformat');
             * if (phoneformat == '123.456.7890') splitvalue = '.'; if
             * (phoneformat == '123 456 7890') splitvalue = ' '; if (phoneformat ==
             * '123-456-7890') splitvalue = '-';
             * 
             */
            //check if  done send phone number checkbox is true 

            if (skipphonenum == 'F' || skipphonenum == false) {

                nlapiLogExecution('DEBUG', 'Skip phone number check box is set to ', skipphonenum + ' therefore sending phone number');
                // nlapiLogExecution('DEBUG','after companyprefereces');
                // nlapiLogExecution('DEBUG','phoneformat & splitvalue ',
                // 'phoneformat = ' + phoneformat + ' splitvalue = ' + splitvalue);
                if (formatno == 1) {
                    splitvalue = ' ';
                }
                if (formatno == 2) {
                    splitvalue = '-';
                }
                if (formatno == 3) {
                    splitvalue = '.';
                }

                nlapiLogExecution('DEBUG', 'phoneformat & splitvalue ',
                    'phoneformat = ' + formatno + ' splitvalue = ' + splitvalue);

                try {
                    var out_fax, out_fax_area_code, out_fax_number = "";
                    var out_fax_country = 1;
                    if (record.getFieldValue('fax') != null || companyFaxNum != null) {
                        var phonevalue = (record.getFieldValue('isperson') != 'T') ? companyFaxNum : record.getFieldValue('fax');
                        var fax_response = phoneFormat(phonevalue, splitvalue);
                        nlapiLogExecution('DEBUG', "fax_response", out_fax);
                        out_fax = fax_response.phone;
                        nlapiLogExecution('DEBUG', "fax number is", out_fax);
                        out_fax_country = fax_response.phone_country;
                        nlapiLogExecution('DEBUG', "fax country code", out_fax_country);
                        out_fax_area_code = fax_response.phone_area_code;
                        nlapiLogExecution('DEBUG', "fax area code", out_fax_area_code);
                        out_fax_number = fax_response.phone_number;
                        nlapiLogExecution('DEBUG', "fax number ", out_fax_area_code);
                    }


                    var out_mobile, out_mobile_area_code, out_mobile_number = "";
                    var out_mobile_country = 1;
                    if (record.getFieldValue('mobilephone') != null || companyMobileNum != null) {
                        var phonevalue = (record.getFieldValue('isperson') != 'T') ? companyMobileNum : record.getFieldValue('mobilephone');
                        var mobilephone_response = phoneFormat(phonevalue, splitvalue);
                        out_mobile = mobilephone_response.phone;
                        nlapiLogExecution('DEBUG', "mobilephone number is", out_mobile);
                        out_mobile_country = mobilephone_response.phone_country;
                        nlapiLogExecution('DEBUG', "mobilephone country code", out_mobile_country);
                        out_mobile_area_code = mobilephone_response.phone_area_code;
                        nlapiLogExecution('DEBUG', "mobilephone area code", out_mobile_area_code);
                        out_mobile_number = mobilephone_response.phone_number;
                        nlapiLogExecution('DEBUG', "mobilephone number ", out_mobile_number);
                    }


                    var vendorType = record.getFieldValue('isperson');
                    nlapiLogExecution('DEBUG', "Check if vendor is type individual ", vendorType);
                    var out_phone, out_phone_area_code, out_phone_number = "";
                    var out_phone_country = 1;
                    //If vendor is company type pull primary contact info 
                    if (vendorType == 'F' && searchresult && searchresult.getValue('phone') != null) {
                        nlapiLogExecution('DEBUG', "Primiary Contact Number is ", searchresult.getValue('phone'));
                        var phonevalue = searchresult.getValue('phone');
                        var phone_response = phoneFormat(phonevalue, splitvalue);
                        out_phone = phone_response.phone;
                        nlapiLogExecution('DEBUG', "phone(search) number is", out_fax);
                        out_phone_country = phone_response.phone_country;
                        nlapiLogExecution('DEBUG', "phone(search)  country code", out_phone_country);
                        out_phone_area_code = phone_response.phone_area_code;
                        nlapiLogExecution('DEBUG', "phone(search)  area code", out_phone_area_code);
                        out_phone_number = phone_response.phone_number;
                        nlapiLogExecution('DEBUG', "phone(search)  number ", out_phone_number);
                    } else {
                        if (record.getFieldValue('phone') != null) {
                            var phonevalue = record.getFieldValue('phone');
                            var phone_response = phoneFormat(phonevalue, splitvalue);
                            out_phone = phone_response.phone;
                            nlapiLogExecution('DEBUG', "phone number is", out_fax);
                            out_phone_country = phone_response.phone_country;
                            nlapiLogExecution('DEBUG', "phone country code", out_phone_country);
                            out_phone_area_code = phone_response.phone_area_code;
                            nlapiLogExecution('DEBUG', "phone area code", out_phone_area_code);
                            out_phone_number = phone_response.phone_number;
                            nlapiLogExecution('DEBUG', "phone number ", out_phone_number);
                        } else {
                            nlapiLogExecution('DEBUG', "phone number skipped: ", "Neither the primary contact available nor the phone number found at header level");
                        }
                    }

                } catch (e) {
                    nlapiLogExecution('Error', "Error Sending Contact numbers to Coupa ", e);
                }




                if ((firstname && lastname) && (contactEmail != '' && contactEmail != null)) {
                    postData = postData + "<primary-contact>";
                    postData = postData + "<email>" + contactEmail +
                        "</email>";
                    if (firstname && lastname) {
                        postData = postData + "<name-family>" + lastname +
                            "</name-family>" + "<name-given>" + firstname +
                            "</name-given>";
                    }

                    if (record.getFieldValue('billcountry') == 'US' || record.getFieldValue('billcountry') == 'CA') {

                        if (out_fax_area_code && out_fax_number) {
                            postData = postData + "<phone-fax>" + "<country-code>" +
                                out_fax_country + "</country-code>" + "<area-code>" +
                                out_fax_area_code + "</area-code>" + "<number>" +
                                out_fax_number + "</number>" + "</phone-fax>";
                        }

                        if (out_mobile_area_code && out_mobile_number) {
                            postData = postData + "<phone-mobile>" + "<country-code>" +
                                out_mobile_country + "</country-code>" +
                                "<area-code>" + out_mobile_area_code +
                                "</area-code>" + "<number>" + out_mobile_number +
                                "</number>" + "</phone-mobile>";
                        }

                        if (out_phone_area_code && out_phone_number) {
                            postData = postData + "<phone-work>" + "<country-code>" +
                                out_phone_country + "</country-code>" + "<area-code>" +
                                out_phone_area_code + "</area-code>" + "<number>" +
                                out_phone_number + "</number>" + "</phone-work>";
                        }
                    }
                    postData = postData + "</primary-contact>";
                }
            } else {
                if ((firstname && lastname) || (contactEmail != '' && contactEmail != null)) { //NIB-319 - Sync First Name and Last Name in case skip Phone Number is set to "T"
                    nlapiLogExecution('AUDIT', 'Skip phone number is set to ' + skipphonenum + ' therefore not adding phone numbers to Payload', ' firstname: ' + firstname + ' | lastname: ' + lastname + ' | contactEmail: ' + contactEmail);
                    postData = postData + "<primary-contact>";
                    postData = postData + "<email>" + contactEmail + "</email>";
                    if (firstname && lastname) {
                        postData = postData + "<name-family>" + lastname + "</name-family>" +
                            "<name-given>" + firstname + "</name-given>";
                    }
                    postData = postData + "</primary-contact>";
                }
            }
            //  nlapiLogExecution('DEBUG', 'Skip phone number is set to ', skipphonenum + ' therefore not sending phone numbers');
            // nlapiLogExecution('DEBUG','Email and EmailTransactions', 'email =
            // ' + record.getFieldValue('email') + ' EmailTransactions = ' +
            // record.getFieldValue('emailtransactions'));
            var out_pomethod = "prompt";
            if (record.getFieldValue('faxtransactions') != null &&
                record.getFieldValue('faxtransactions') == 'T')
                out_pomethod = "prompt";

            if (record.getFieldValue('printtransactions') != null &&
                record.getFieldValue('printtransactions') == 'T')
                out_pomethod = "prompt";

            if (record.getFieldValue('email') != null &&
                record.getFieldValue('email').length > 0) {
                if (record.getFieldValue('emailtransactions') != null &&
                    record.getFieldValue('emailtransactions') == 'T')
                    out_pomethod = "email";
            }

            var out_pomethod = "prompt";
            if (record.getFieldValue('faxtransactions') != null && record.getFieldValue('faxtransactions') == 'T')
                out_pomethod = "prompt";

            if (record.getFieldValue('printtransactions') != null && record.getFieldValue('printtransactions') == 'T')
                out_pomethod = "prompt";

            if (record.getFieldValue('email') != null && record.getFieldValue('email').length > 0) {
                if (record.getFieldValue('emailtransactions') != null && record.getFieldValue('emailtransactions') == 'T')
                    out_pomethod = "email";
            }

            postData = postData + "<po-method>" + out_pomethod + "</po-method>";

            if (record.getFieldValue('taxidnum'))
                postData = postData + "<tax-id>" +
                record.getFieldValue('taxidnum') + "</tax-id>";

            if (record.getFieldValue('accountnumber'))
                postData = postData + "<account-number>" +
                record.getFieldValue('accountnumber') +
                "</account-number>";

            postData = postData + "<number>" + recordid + "</number>";

            if (context.getSetting('SCRIPT',
                    'custscript_vendor_poemailoverride')) {
                if (record.getFieldValue(context.getSetting('SCRIPT',
                        'custscript_vendor_poemailoverride'))) {
                    postData = postData +
                        "<po-email>" +
                        record.getFieldValue(context.getSetting('SCRIPT',
                            'custscript_vendor_poemailoverride')) +
                        "</po-email>";
                    nlapiLogExecution(
                        'DEBUG',
                        'withn PO email override',
                        'email = ' +
                        record
                        .getFieldValue(context
                            .getSetting('SCRIPT',
                                'custscript_vendor_poemailoverride')));
                }
            } else if (record.getFieldValue('email'))
                postData = postData + "<po-email>" +
                record.getFieldValue('email') + "</po-email>";



            var addcount = record.getLineItemCount('addressbook');
            var isDefaultShipping = '',
                defShipAddFound = false;
            var verifyCount = isNotEmpty(addcount);
            nlapiLogExecution('debug', 'Is address count not 0?', verifyCount);

            if (verifyCount) { //NIB-376 Get Shipping Address from Addressbook sublist

                for (var i = 1; i <= addcount; i++) { // loop thru all address records
                    isDefaultShipping = record.getLineItemValue('addressbook', 'defaultshipping', i);
                    if (isDefaultShipping == 'T') { // check for default shipping
                        defShipAddFound = true;
                        var shipAddr1 = record.getLineItemValue('addressbook', 'addr1', i) ? record.getLineItemValue('addressbook', 'addr1', i) : '';
                        var shipAddr2 = record.getLineItemValue('addressbook', 'addr2', i) ? record.getLineItemValue('addressbook', 'addr2', i) : '';
                        var shipAddr3 = record.getLineItemValue('addressbook', 'addr3', i) ? record.getLineItemValue('addressbook', 'addr3', i) : '';
                        var shipCity = record.getLineItemValue('addressbook', 'city', i) ? record.getLineItemValue('addressbook', 'city', i) : '';
                        var shipState = record.getLineItemValue('addressbook', 'state', i) ? record.getLineItemValue('addressbook', 'state', i) : '';
                        var shipZip = record.getLineItemValue('addressbook', 'zip', i) ? record.getLineItemValue('addressbook', 'zip', i) : '';
                        var shipCountry = record.getLineItemValue('addressbook', 'country', i) ? record.getLineItemValue('addressbook', 'country', i) : '';

                        postData = postData + "<primary-address>";
                        postData += "<street1>" + convertCDATA(shipAddr1) + "</street1>";
                        postData += "<street2>" + convertCDATA(shipAddr2 + " " + (shipAddr3 == null ? "" : shipAddr3)) + "</street2>";
                        if (shipCity != "" && shipCity != null && shipCity != undefined)
                            postData += "<city>" + convertCDATA(shipCity) + "</city>";
                        if (shipState != "" && shipState != null && shipState != undefined)
                            postData += "<state>" + convertCDATA(shipState) + "</state>";
                        if (shipZip != "" && shipZip != null && shipZip != undefined)
                            postData += "<postal-code>" + convertCDATA(shipZip) + "</postal-code>";
                        if (shipCountry != "" && shipCountry != null && shipCountry != undefined)
                            postData += "<country>" + "<code>" + convertCDATA(shipCountry) + "</code>" + "</country>";
                        postData += "</primary-address>";
                        break;
                    }
                }
                if (!defShipAddFound) {
                    nlapiLogExecution('AUDIT', 'Skipping Primary Address', 'Default Shipping Address not found.');
                }
            } else {
                nlapiLogExecution('AUDIT', 'Skipped syncing Primary Address.', 'No Addresses found in the Address sublist');
            }


            // Content Group Mapping
            if (context.getSetting('SCRIPT',
                    'custscript_vendor_contentgroup_field')) {
                var contentgrpvalue = record.getFieldValue(context.getSetting(
                    'SCRIPT', 'custscript_vendor_contentgroup_field'));
                nlapiLogExecution('DEBUG', 'content group field values are ',
                    contentgrpvalue);
                if (contentgrpvalue) {
                    postData = postData + "<content-groups>";
                    var contentgrplist = null;
                    contentgrplist = contentgrpvalue.split(',');
                    if (contentgrplist) {
                        for (i = 0; i < contentgrplist.length; i++) {
                            nlapiLogExecution('DEBUG',
                                'content group list is ', contentgrplist[i]);
                            postData = postData + "<content-group>";
                            postData = postData + "<name>" + contentgrplist[i] +
                                "</name>";
                            postData = postData + "</content-group>";
                        }
                    } else {
                        nlapiLogExecution('DEBUG', 'content group list is ',
                            contentgrpvalue);
                        postData = postData + "<content-group>";
                        postData = postData + "<name>" + contentgrpvalue +
                            "</name>";
                        postData = postData + "</content-group>";
                    }
                    postData = postData + "</content-groups>";

                    if (supplierId != "" && supplierId != null) {
                        var blankPutData = "<supplier><content-groups></content-groups></supplier>";
                        var blankURL = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url') + '/api/suppliers/' + supplierId;
                        var initialResponse = nlapiRequestURL(blankURL, blankPutData, headers, 'PUT');
                        if (initialResponse.getCode() != '200') {
                            nlapiLogExecution("ERROR", "Failure to remove Previously synced Content Group before Updating the Content Groups for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                        } else {
                            nlapiLogExecution("DEBUG", "Successfully updated content group for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                        }
                        // Need to clear out Everyone Content Group
                        var everyoneUrl = nlapiGetContext().getSetting(
                                'SCRIPT', 'custscript_coupa_oidc_client_url') +
                            '/api/suppliers/' +
                            supplierId +
                            '/business_groups/1/remove';
                        var everyonePayload = '<supplier><content-groups></content-groups></supplier>';
                        var contentResponse = nlapiRequestURL(everyoneUrl,
                            everyonePayload, headers, 'PUT');

                        if (contentResponse.getCode() == '200') {
                            nlapiLogExecution("DEBUG",
                                "Succesfully cleared Everyone content group from SupplierID " +
                                supplierId, "Response Code: " +
                                contentResponse.getCode() +
                                " Body response: " +
                                contentResponse.getBody());
                        } else {
                            nlapiLogExecution("ERROR",
                                "Failure to clear Everyone content group from SupplierID " +
                                supplierId, "Response Code: " +
                                contentResponse.getCode() +
                                " Body response: " +
                                contentResponse.getBody());
                        }
                    }
                } else {
                    if (supplierId != "" && supplierId != null) {
                        var blankPutData = "<supplier><content-groups></content-groups></supplier>";
                        var blankURL = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url') + '/api/suppliers/' + supplierId;
                        var initialResponse = nlapiRequestURL(blankURL, blankPutData, headers, 'PUT');
                        if (initialResponse.getCode() != '200') {
                            nlapiLogExecution("ERROR", "Failure to remove Previously synced Content Group before Updating the Content Groups for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                        } else {
                            nlapiLogExecution("DEBUG", "Successfully updated content group for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                        }
                    }
                }
            } // end check for parameter

            // Invoice Matching Level

            nlapiLogExecution('DEBUG', 'Invoice Match Level = ',
                invoicematchlevel);

            if (invoicematchlevel != null) {
                var out_invoicematchlevel = new Array();
                out_invoicematchlevel = invoicematchlevel.split(':');

                // nlapiLogExecution('DEBUG','Invoice Match Level [1] = ', '
                // invoicematchlevel[1] = ' + out_invoicematchlevel[1]);
                // nlapiLogExecution('DEBUG','Invoice Match Level Value = ',
                // record.getFieldValue(out_invoicematchlevel[1]));

                if (out_invoicematchlevel[1] != '' &&
                    out_invoicematchlevel[1] != null) {
                    var match_level = record
                        .getFieldValue(out_invoicematchlevel[1]);
                    //if (match_level.indexOf('way') < 0)
                    //suggested change 
                    if ((match_level.indexOf('way') < 0) && (match_level != 'none')) {
                        match_level = record
                            .getFieldText(out_invoicematchlevel[1]);
                    }
                    postData = postData + "<invoice-matching-level>" +
                        match_level + "</invoice-matching-level>";
                } else {
                    postData = postData + "<invoice-matching-level>" +
                        out_invoicematchlevel[0] +
                        "</invoice-matching-level>";
                    // nlapiLogExecution('DEBUG','Invoice Match Level',
                    // out_invoicematchlevel[0]);
                }
            } else
                postData = postData + "<invoice-matching-level>" + "2-way" +
                "</invoice-matching-level>";

            //New code added by ravi on June 7th-2022.            

            // Hold POs for buyer review
            var buyerreview = record.getFieldValue('custentity_buyer_hold');
            nlapiLogExecution('DEBUG', 'Hold POs for buyer review in NetSuite = ', buyerreview);
            var buyerhold;
            if (buyerreview == 'T') {
                buyerhold = "true";
            } else {
                buyerhold = "false";
            }
            nlapiLogExecution('DEBUG', 'Hold POs for buyer review to be set in Coupa = ', buyerhold);
            postData = postData + "<buyer-hold>" + buyerhold + "</buyer-hold>";

            // Minority / Women - Owned / Business Enterprise
            var mwbe = record.getFieldValue('custentity_minority_women_business');
            nlapiLogExecution('DEBUG', 'mwbe = ', mwbe);
            var mwbe_value;
            if (mwbe == 'T') {
                mwbe_value = "true";
            } else {
                mwbe_value = "false";
            }
            nlapiLogExecution('DEBUG', 'MWBE value to be set = ', mwbe_value);
            postData = postData + "<minoritywomenownedbusinessetp>" + mwbe_value + "</minoritywomenownedbusinessetp>";

            var cat_a = record.getFieldValue('custentity_category_a');
            nlapiLogExecution('DEBUG', 'cat_a = ', cat_a);
            var category_a;
            if (cat_a == 'T') {
                category_a = "true";
            } else {
                category_a = "false";
            }
            nlapiLogExecution('DEBUG', 'Category A value to be set = ', category_a);
            postData = postData + "<category_a>" + category_a + "</category_a>";

            var cat_b = record.getFieldValue('custentity_category_b');
            nlapiLogExecution('DEBUG', 'cat_b = ', cat_b);
            var category_b;
            if (cat_b == 'T') {
                category_b = "true";
            } else {
                category_b = "false";
            }
            nlapiLogExecution('DEBUG', 'Category B value to be set = ', category_b);
            postData = postData + "<category_b>" + category_b + "</category_b>";

            var cat_c = record.getFieldValue('custentity_category_c');
            nlapiLogExecution('DEBUG', 'cat_c = ', cat_c);
            var category_c;
            if (cat_c == 'T') {
                category_c = "true";
            } else {
                category_c = "false";
            }
            nlapiLogExecution('DEBUG', 'Category C value to be set = ', category_c);
            postData = postData + "<category_c>" + category_c + "</category_c>";
            //upto here.


            // Payment Method
            if (paymentmethod != null && isCreateMode) {
                //Send Payment Method only in case of Create Mode. Do not override the Payment Method in Edit Mode.
                var out_paymentmethod = new Array();
                out_paymentmethod = paymentmethod.split(':');

                if (out_paymentmethod != '') {
                    if (out_paymentmethod[1] != '' &&
                        out_paymentmethod[1] != null) {
                        postData = postData + "<payment-method>" +
                            record.getFieldValue(out_paymentmethod[1]) +
                            "</payment-method>";
                        nlapiLogExecution('DEBUG', 'Payment Method', record
                            .getFieldValue(out_paymentmethod[1]));
                    } else {
                        postData = postData + "<payment-method>" +
                            out_paymentmethod[0] + "</payment-method>";
                        nlapiLogExecution('DEBUG', 'Payment Method',
                            out_paymentmethod[0]);
                    }
                }
            }

            // Invoice Emails
            if (invoiceemails != null) {
                var recvalue = record.getFieldValue(invoiceemails);
                nlapiLogExecution('DEBUG', 'if Invoiceemails not NULL',
                    recvalue);
                if (recvalue != '' && recvalue != null) {
                    var recvalues = recvalue.split(',');
                    postData = postData + "<invoice-emails>";
                    for (i = 0; i < recvalues.length; i++) {
                        postData = postData + "<invoice-email><email>" +
                            recvalues[i] + "</email></invoice-email>";
                        nlapiLogExecution('DEBUG', 'Invoice email ' + i,
                            ' email = ' + recvalues[i]);
                    }
                    postData = postData + "</invoice-emails>";
                }
            }

            var routeinv;
            routeinv = "true";
            postData = postData + "<send-invoices-to-approvals>" + routeinv + "</send-invoices-to-approvals>";

            // Send Invoices to Approval
            /* if (sendinvoicestoapprov != null) {
                 var out_sendinvoicestoapprov = new Array();
                 out_sendinvoicestoapprov = sendinvoicestoapprov.split(':');

                 if (out_sendinvoicestoapprov[1] != '' &&
                     out_sendinvoicestoapprov[1] != null) {

                     if (record.getFieldValue(out_sendinvoicestoapprov[1]) == 'T' ||
                         record
                         .getFieldValue(out_sendinvoicestoapprov[1]) == 'Y' ||
                         record
                         .getFieldValue(out_sendinvoicestoapprov[1]) == 'Yes' ||
                         record
                         .getFieldValue(out_sendinvoicestoapprov[1]) == 'true') {
                         postData = postData +
                             "<send-invoices-to-approvals>true</send-invoices-to-approvals>";
                     } else {
                         postData = postData +
                             "<send-invoices-to-approvals>false</send-invoices-to-approvals>";
                     }
                 } else {
                     if (out_sendinvoicestoapprov[0] == 'T' ||
                         out_sendinvoicestoapprov[0] == 'Y' ||
                         out_sendinvoicestoapprov[0] == 'Yes' ||
                         out_sendinvoicestoapprov[0] == 'true') {
                         postData = postData +
                             "<send-invoices-to-approvals>true</send-invoices-to-approvals>";
                     } else {
                         postData = postData +
                             "<send-invoices-to-approvals>false</send-invoices-to-approvals>";
                     }
                     nlapiLogExecution('DEBUG', 'Send Invoices to Approval',
                         out_sendinvoicestoapprov[0]);
                 }
             }*/

            // Allow Invoicing from CSN
            if (allowinvocingfromcsn != null) {
                var out_allowinvocingfromcsn = new Array();
                out_allowinvocingfromcsn = allowinvocingfromcsn.split(':');

                if (out_allowinvocingfromcsn[1] != '' &&
                    out_allowinvocingfromcsn[1] != null) {
                    if (record.getFieldValue(out_allowinvocingfromcsn[1]) == 'T' ||
                        record
                        .getFieldValue(out_allowinvocingfromcsn[1]) == 'Y' ||
                        record
                        .getFieldValue(out_allowinvocingfromcsn[1]) == 'Yes' ||
                        record
                        .getFieldValue(out_allowinvocingfromcsn[1]) == 'true') {
                        postData = postData +
                            "<allow-inv-from-connect>true</allow-inv-from-connect>";
                    } else {
                        postData = postData +
                            "<allow-inv-from-connect>false</allow-inv-from-connect>";
                    }
                } else {
                    if (out_allowinvocingfromcsn[0] == 'T' ||
                        out_allowinvocingfromcsn[0] == 'Y' ||
                        out_allowinvocingfromcsn[0] == 'Yes' ||
                        out_allowinvocingfromcsn[0] == 'true') {
                        postData = postData +
                            "<allow-inv-from-connect>true</allow-inv-from-connect>";
                    } else {
                        postData = postData +
                            "<allow-inv-from-connect>false</allow-inv-from-connect>";
                    }
                    nlapiLogExecution('DEBUG', 'Allow Invoicing from CSN',
                        out_allowinvocingfromcsn[0]);
                }
            }

            var customFieldData = '';
            var isNestedCustomField = false;
            var parentArray = new Array();

            for (var i = 1; i <= context.getSetting('SCRIPT',
                    'custscript_vendor_customfieldscount'); i++) {
                var customfield = new Array();
                var retValue = '';
                customfield = context.getSetting('SCRIPT',
                    'custscript_vendor_customfield' + i).split(':');

                if (customfield[3] == 'Boolean' && customfield[2] == 'Boolean') {
                    if (record.getFieldValue(customfield[1]) == 'T') {
                        retValue = 'true';
                    }
                    if (record.getFieldValue(customfield[1]) == 'F') {
                        retValue = 'false';
                    }
                }
                if (customfield[3] == 'Text' || customfield[3] == 'text') {

                    retValue = convertCDATA(record.getFieldText(customfield[1]));
                    nlapiLogExecution('DEBUG', 'Custofieldtype = Text',
                        'value = ' + retValue);
                }

                if (customfield[3] == 'Value' || customfield[3] == 'value') {
                    retValue = convertCDATA(record.getFieldValue(customfield[1]));
                    nlapiLogExecution('DEBUG', 'Custofieldtype = Value',
                        'value = ' + retValue);
                }

                if ((retValue == null || retValue == '') &&
                    customfield[4] != null && customfield[4] != '') {
                    retValue = convertCDATA(customfield[4]);
                }

                if (customfield[2] == 'Lookup' || customfield[2] == 'lookup') {
                    retValue = '<external-ref-num>' + retValue +
                        '</external-ref-num>';
                }

                //support for multi custom field functionality.

                if (customfield[0].indexOf('/') > -1) {
                    isNestedCustomField = true;
                    fields = customfield[0].split('/');
                    parentField = fields[0];
                    nestedField = fields[1];
                    nlapiLogExecution('DEBUG', 'Coupa Custom field is a nested attribute', 'Nested field: ' + nestedField + ' Parent field: ' + parentField);
                    var nestedFieldData = "<" + nestedField + ">" + retValue + "</" + nestedField + ">";
                    var parentTag = "<" + parentField + ">";
                    if (parentArray.indexOf(parentField) > -1) {
                        customFieldData = customFieldData.substring(0, customFieldData.indexOf(parentTag) + parentTag.length) + nestedFieldData + customFieldData.substring(customFieldData.indexOf(parentTag) + parentTag.length);
                    } else {
                        customFieldData = customFieldData + "<" + parentField + ">" + nestedFieldData + "</" + parentField + ">";
                    }
                    parentArray.push(parentField);
                } else {
                    postData = postData + "<" + customfield[0] + ">" + retValue + "</" + customfield[0] + ">"
                }
            }
            if (isNestedCustomField == true) {
                postData = postData + customFieldData;
            }

            if (supplierId == null || supplierId == "") {
                postData = postData + "</supplier></suppliers>";
            } else {
                postData = postData + "</supplier>";
            }
            nlapiLogExecution('DEBUG', 'postData = ', postData);

            var response;
            if (supplierId == null || supplierId == "") {
                response = nlapiRequestURL(url, postData, headers);
            } else {
                response = nlapiRequestURL(url, postData, headers, 'PUT');
            }
            /*
             * objFile = nlapiCreateFile('Request_' + nlapiDateToString(new
             * Date(),'date') + nlapiDateToString(new Date(),'timeofday') +
             * '.csv', 'CSV',postData); objFile.setFolder(578923); id =
             * nlapiSubmitFile(objFile);
             */

            if (response.getCode() == '201' || response.getCode() == '200') {
                var responseXML = nlapiStringToXML(response.getBody());
                response_status = "";
                if (supplierId != null && supplierId != "") {
                    response_status = 'SUCCESS';
                    externalid = nlapiSelectValue(responseXML, 'supplier/id');
                } else {
                    response_status = nlapiSelectValue(responseXML,
                        'results/result/status');
                }
                if (response_status == 'SUCCESS') {

                    nlapiLogExecution('AUDIT',
                        'Successfully created/Updated Supplier in Coupa ',
                        'Id = ' + recordid + ' Name = ' +
                        record.getFieldValue('companyname'));
                    if (externalid == null || externalid == "") {
                        externalid = nlapiSelectValue(responseXML,
                            'results/result/unique-keys/id');
                    }
                    nlapiLogExecution('AUDIT', 'External Id', externalid);
                    nlapiLogExecution('AUDIT', 'Trying to Upsert RTA in Coupa', '');
                    if (context.getSetting('SCRIPT', 'custscript_vendor_skip_rta_sync') == 'F' || !context.getSetting('SCRIPT', 'custscript_vendor_skip_rta_sync')) {
                        createRTA(record); //NIB-376 Create/Update RTA record in Coupa
                    }
                    syncContentGroups(record, externalid); //NIB-392 Update the Supplier created in Coupa with Content Group based on the mapping in script parameter
                    record.setFieldValue('externalid', "CoupaSupplier-" +
                        externalid);
                    if (context.getSetting('SCRIPT',
                            'custscript_vendor_id_field') != null)
                        record.setFieldValue(context.getSetting('SCRIPT',
                            'custscript_vendor_id_field'), externalid);

                    if (context.getSetting('SCRIPT', 'custscript_vendor_skip_scheduled') == 'T') {
                        if (nlapiGetContext().getExecutionContext() == "scheduled" || nlapiGetContext().getExecutionContext() == "mapreduce") {
                            nlapiLogExecution('DEBUG', 'Skipping Save', 'Saving skipped as it was triggered by a scheduled script');
                        } else {
                            if (type != 'delete') {
                                nlapiSubmitRecord(record);
                            }
                        }

                    }
                    //added code to populate coupa supplier ID in NS
                    else {
                        if (type != 'delete') {
                            nlapiSubmitRecord(record);
                        }
                    }
                } else {

                    nlapiLogExecution('ERROR',
                        'Error creating/Updating Supplier in Coupa ',
                        'NetsuiteId = ' + recordid + ' Vendor Name = ' +
                        record.getFieldValue('companyname') +
                        response.getBody());

                    nlapiSendEmail(991, ['VendorMgmt@genesys.com', 'Apps-Dev-Team@genesys.com'], context
                        .getSetting('SCRIPT',
                            'custscript_vendor_accountname') +
                        ' - Error creating/Updating Supplier in Coupa',
                        'Netsuite Vendor ID =' + recordid +
                        ' Vendor Name = ' +
                        record.getFieldValue('companyname') +
                        '\n\n' + 'Response Error Below:' + '\n' +
                        response.getBody());

                }

            } else {

                nlapiLogExecution('ERROR',
                    'Error creating/Updating Supplier in Coupa ',
                    'NetsuiteId = ' + recordid + ' Vendor Name = ' +
                    record.getFieldValue('companyname') +
                    ' Response Error Code:' + response.getCode());

                nlapiSendEmail(991, ['VendorMgmt@genesys.com', 'Apps-Dev-Team@genesys.com'], context
                    .getSetting('SCRIPT', 'custscript_vendor_accountname') +
                    ' - Error creating/Updating Supplier in Coupa',
                    'Netsuite Vendor ID =' + recordid + ' Vendor Name = ' +
                    record.getFieldValue('companyname') +
                    ' Response Error Code:' + response.getCode());

                // record.setFieldValue('externalid', 'NULL');
                // nlapiSubmitRecord(record);
            }

            /*
             * objFile = nlapiCreateFile('Response_' + nlapiDateToString(new
             * Date(),'date') + nlapiDateToString(new Date(),'timeofday') +
             * '.csv', 'CSV', response.getBody()); objFile.setFolder(578923); id =
             * nlapiSubmitFile(objFile);
             */

        } // try end
        catch (error) {
            if (error instanceof nlobjError) {
                var errordetails;
                errorcode = error.getCode();
                switch (errorcode) {
                    case "SSS_REQUEST_TIME_EXCEEDED":
                        if (iTimeOutCnt > 2) {
                            errordetails = "Connection closed because it has exceed the time out period (NetSuite has not received a response after 5 seconds on initial connection or after 45 seconds on the request). tried to establish connection 3 times and still failed. Please contact Technical Support.";
                            exit = true;
                            break;
                        } else {
                            errordetails = "Connection closed because it has exceed the time out period (NetSuite has not received a response after 5 seconds on initial connection or after 45 seconds on the request). retrying to establish a connection.";
                            iTimeOutCnt = iTimeOutCnt + 1;
                            k = 0;
                            break;
                        }
                    default:
                        errordetails = error.getDetails() + ".";
                        exit = true;
                        break;
                }

                nlapiLogExecution('ERROR', 'Process Error', errorcode + ': ' +
                    errordetails);
                nlapiSendEmail(991, ['VendorMgmt@genesys.com', 'Apps-Dev-Team@genesys.com'], context
                    .getSetting('SCRIPT', 'custscript_vendor_accountname') +
                    ' - Error creating/Updating Supplier in Coupa',
                    'Netsuite Vendor ID =' + recordid + ' Vendor Name = ' +
                    record.getFieldValue('companyname') + '\n\n' +
                    'Error Code:' + errorcode + '\n' +
                    'Error Message:' + errordetails);

            } else {
                nlapiLogExecution('ERROR', 'uncaught error', error);
            }
        } // catch end
    } // loop end

}

/**
 * @description function to handle multiple phone formats and spilt values
 * @param phoneString
 * @param splitvalue
 * @supported formats: ["(123) 456-7890","123 456 7890","123-456-7890","123.456.7890"]
 * @return {{phone, phone_country: string, phone_number: string, phone_area_code: (string|string|*)}}
 */
function phoneFormat(phoneString, splitvalue) {
    var phone, phone_area_code, phone_number = "";
    phone = phoneString;
    nlapiLogExecution('DEBUG', "phoneString:  ", phoneString);
    var phone_country = '1';
    phoneString = phoneString.replace(/\+/g, "");
    if (phoneString.indexOf('ext') == -1) {
        var spaceSplit = phoneString.split(' ');
        if (spaceSplit && spaceSplit.length > 1) {
            if (spaceSplit[0].indexOf('(') == -1) {
                phone_country = spaceSplit[0];
            } else {
                phone_area_code = spaceSplit[0].replace(/[+()]/g, '');
            }
            if (splitvalue == ' ') {
                phoneString = spaceSplit.slice(1).join(' ');
            } else {
                phoneString = spaceSplit[1];
            }
        }
        var phoneStringSplit = phoneString.replace(/[+()]/g, '').split(splitvalue);
        if (phoneStringSplit && phoneStringSplit.length == 2) {
            phone_area_code = phoneStringSplit[0].trim();
            phone_number = phoneStringSplit[1].trim();
        } else if (phoneStringSplit && phoneStringSplit.length >= 3) {
            phone_area_code = phoneStringSplit[0];
            phone_number = phoneStringSplit[1];
            phone_number += phoneStringSplit && phoneStringSplit[2] ? phoneStringSplit[2] : ''
        } else {
            phone_number = phoneStringSplit[0]
        }
    } else {
        var extSplit = phoneString.split(' ext ');
        var externsion = extSplit[1];
        phoneString = extSplit[0];
        var spaceSplit = phoneString.split(' ');
        if (spaceSplit && spaceSplit.length > 1) {
            phone_country = spaceSplit[0];
            phoneString = spaceSplit[1];
        }
        var phoneStringSplit = phoneString.replace(/[+()]/g, '').split(splitvalue);
        phone_area_code = phoneStringSplit[0];
        phone_number = phoneStringSplit[1];
        phone_number += phoneStringSplit && phoneStringSplit[2] ? phoneStringSplit[2] : '';
        phone_number += externsion ? ' ext ' + externsion : '';
    }
    if (phone_number.indexOf('-') > -1) {
        phone_number = phone_number.replace(/[-]/g, '')
    }
    var response = {
        phone: phone,
        phone_country: phone_country,
        phone_area_code: phone_area_code,
        phone_number: phone_number
    }
    nlapiLogExecution('DEBUG', "Parsed Phone Number ", JSON.stringify(response));
    return response;
}

function executeSearch() {
    var rec = '';
    var searchresults = nlapiSearchRecord('vendor', null, null, null);
    for (var i = 0; i < Math.min(500, searchresults.length); i++) {
        var record = nlapiLoadRecord(searchresults[i].getRecordType(),
            searchresults[i].getId());
        rec = rec + record.getRecordType();
        rec = rec + '  -Record ID = ' + record.getId() + ' Company Name = ' +
            record.getFieldValue('companyname');
    }
    return rec;
}

function getCoupaSupplier(supplierName, supplierNumber, url, header, supplier) {
    var getResponse = '';
    var nameUrl = url + '/api/suppliers?name=' +
        supplierName.replace(/ /g, '%20').replace(/&/g, '%26').replace(/#/g, '%23');
    var numberUrl = url + '/api/suppliers?number=' +
        supplierNumber.replace(/ /g, '%20');
    nlapiLogExecution("DEBUG", "nameUrl", nameUrl);
    nlapiLogExecution("DEBUG", "numberUrl", numberUrl);

    if (context.getSetting('SCRIPT', 'custscript_vendor_id_field') != null &&
        supplier.getFieldValue(context.getSetting('SCRIPT',
            'custscript_vendor_id_field')) != null) {
        var idUrl = url +
            '/api/suppliers/' +
            supplier.getFieldValue(context.getSetting('SCRIPT',
                'custscript_vendor_id_field'));
        nlapiLogExecution("DEBUG", "idUrl", idUrl);
        var idResponse = nlapiRequestURL(idUrl, null, header, 'GET');
        if (idResponse.getCode() == '200') {
            var responseXML = nlapiStringToXML(idResponse.getBody());
            var coupaSupplierId = nlapiSelectValue(responseXML, 'supplier/id');
            nlapiLogExecution('DEBUG', 'Supplier ID is = ', coupaSupplierId);
            return coupaSupplierId;
        } else {
            nlapiLogExecution("DEBUG", "Failure to retrieve supplier by ID",
                "Response Code: " + idResponse.getCode() +
                " Body response: " + idResponse.getBody());
        }
    }

    getResponse = nlapiRequestURL(nameUrl, null, header, 'GET');
    nlapiLogExecution('DEBUG', 'Name url response code is = ', getResponse
        .getCode());

    if (getResponse.getCode() == '200') {
        var responseXML = nlapiStringToXML(getResponse.getBody());
        var coupaSupplierId = nlapiSelectValue(responseXML,
            'suppliers/supplier/id');
        nlapiLogExecution('DEBUG', 'Supplier ID is = ', coupaSupplierId);
        return coupaSupplierId;
    } else {
        if (getResponse.getCode() == '404') {
            getNumberResponse = nlapiRequestURL(numberUrl, null, header, 'GET');
            nlapiLogExecution('DEBUG', 'Number url response code is = ',
                getNumberResponse.getCode());
            if (getNumberResponse.getCode() == '200') {
                var responseXML = nlapiStringToXML(getNumberResponse.getBody());
                var coupaSupplierId = nlapiSelectValue(responseXML,
                    'suppliers/supplier/id');
                nlapiLogExecution('DEBUG', 'Supplier ID is = ', coupaSupplierId);
                return coupaSupplierId;
            } else {
                nlapiLogExecution("DEBUG",
                    "Failure to retrieve supplier by number",
                    "Response Code: " + getNumberResponse.getCode() +
                    " Body response: " +
                    getNumberResponse.getBody());
            }
        }
        nlapiLogExecution("DEBUG", "Failure to retrieve supplier by name",
            "Response Code: " + getResponse.getCode() + " Body response: " +
            getResponse.getBody());
    }
    return null;
}

function CoupaCallBack(response) {
    nlapiLogExecution('DEBUG', 'In fucntion CoupaCallBack');
}

function xmlEncode(string) {
    return string.replace(/\&/g, '&' + 'amp;').replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;').replace(/\'/g, '&' + 'apos;').replace(
            /\"/g, '&' + 'quot;');
}

function convertCDATA(inputdata) {
    return inputdata ? "<![CDATA[" + inputdata + "]]>" : '';
}

function isNotEmpty(x) {
    var flag = false;
    if (x != null && x != '' && x != 0) {
        flag = true;
    }
    return flag;
}

/**
 * This function UPSERTS the Remit-to address to Coupa
 * @method
 * @param vendor record
 * @return -NA-
 * @author Yogesh Jagdale
 * @since 6.1.0
 */
function createRTA(record) {
    try {
        var supplierID = record.getFieldValue('custentity_coupa_supplier_id');
        if (supplierID == "" || supplierID == null || supplierID == undefined) {
            nlapiLogExecution('AUDIT', 'Skipped syncing Remit To Address based on custentity_coupa_supplier_id field value.', 'supplierID not found in field with Internal ID: custentity_coupa_supplier_id');
            var oidcHeader = getAPIHeader('text/xml'); //NIB# 331 Get OIDC API Header
            var headers = new Array();
            if (oidcHeader) {
                headers = oidcHeader;
            } 
            supplierID = getCoupaSupplier(record.getFieldValue('entityid'), record.getId(), nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url'), headers, record);
        }
        if (supplierID == "" || supplierID == null || supplierID == undefined) {
            nlapiLogExecution('AUDIT', 'Skipped syncing Remit To Address.', 'Supplier Not Available in Coupa with name: ' + record.getFieldValue('entityid'));
            return
        }
        nlapiLogExecution('DEBUG', 'supplierID: ', supplierID);
        var addcount = record.getLineItemCount('addressbook');
        var isDefBill = '',
            addId = '',
            payloadJSON = {},
            postResponse = '',
            putResponse = '';
        var verifyCount = isNotEmpty(addcount);
        nlapiLogExecution('DEBUG', 'Is add count not 0?', verifyCount);
        if (verifyCount) {
            for (var i = 1; i <= addcount; i++) { // loop thru all address records
                isDefBill = record.getLineItemValue('addressbook', 'defaultbilling', i);
                if (isDefBill == 'T') { // check for default billing
                    addId = record.getLineItemValue('addressbook', 'id', i);
                    payloadJSON["remit-to-code"] = record.getFieldValue('entityid') + '_' + record.getLineItemValue('addressbook', 'id', i); //create JSON Payload
                    payloadJSON["name"] = record.getLineItemValue('addressbook', 'label', i) ? record.getLineItemValue('addressbook', 'label', i) : '';
                    payloadJSON["street1"] = record.getLineItemValue('addressbook', 'addr1', i) ? record.getLineItemValue('addressbook', 'addr1', i) : '';
                    payloadJSON["street2"] = (record.getLineItemValue('addressbook', 'addr2', i) ? record.getLineItemValue('addressbook', 'addr2', i) : '') + (record.getLineItemValue('addressbook', 'addr3', i) ? record.getLineItemValue('addressbook', 'addr3', i) : '');
                    payloadJSON["city"] = record.getLineItemValue('addressbook', 'city', i) ? record.getLineItemValue('addressbook', 'city', i) : '';
                    payloadJSON["state"] = record.getLineItemValue('addressbook', 'state', i) ? record.getLineItemValue('addressbook', 'state', i) : '';
                    payloadJSON["postal-code"] = record.getLineItemValue('addressbook', 'zip', i) ? record.getLineItemValue('addressbook', 'zip', i) : '';
                    payloadJSON["active"] = true;
                    payloadJSON["external-src-ref"] = record.getLineItemValue('addressbook', 'id', i);
                    payloadJSON["external-src-name"] = record.getLineItemValue('addressbook', 'label', i);
                    payloadJSON["country"] = {
                        "code": (record.getLineItemValue('addressbook', 'country', i) ? record.getLineItemValue('addressbook', 'country', i) : '')
                    };
                    break;
                }
            }
            //Verify if already present in Coupa
            var oidcHeader = getAPIHeader('application/json'); //NIB# 331 Get OIDC API Header
            var headers = new Array();
            if (oidcHeader) {
                headers = oidcHeader;
            } 
            var base_url = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url');
            if (addId != "" && addId != null && addId != undefined) {
                var searchURL = base_url + '/api/suppliers/' + supplierID + '/addresses?external_src_ref=' + addId + '&active=true'
                var searchResponse = nlapiRequestURL(searchURL, null, headers, 'GET'); //Search for RTA based on external-src-ref as address internal id
                if (JSON.parse(searchResponse.getBody()) && JSON.parse(searchResponse.getBody()).length == 0) {
                    //Create JSON Payload and Post to Coupa to create RTA
                    if (supplierID != null || supplierID != "") {
                        var postURL = base_url + '/api/suppliers/' + supplierID + '/addresses/'
                        nlapiLogExecution('AUDIT', 'payloadJSON: ', JSON.stringify(payloadJSON));
                        postResponse = nlapiRequestURL(postURL, JSON.stringify(payloadJSON), headers);
                        if (postResponse.getCode() == '201' || postResponse.getCode() == '200') {
                            var postResponseJSON = JSON.parse(postResponse.getBody());
                            nlapiLogExecution('AUDIT', 'Successfully created Supplier RTA in Coupa ', 'Id = ' + supplierID + ' Name = ' + record.getFieldValue('companyname'));
                        } else {
                            nlapiLogExecution('AUDIT', 'Failed to Post RTA to Coupa', 'Response Code: ' + postResponse.getCode() + ' postResponse : ' + postResponse.getBody());
                        }
                    }
                } else {
                    //Create JSON Payload and PUT to Coupa to update RTA
                    var searchResponse = searchResponse.getBody() ? JSON.parse(searchResponse.getBody()) : undefined;
                    if (searchResponse && searchResponse.length > 0) {
                        var putURL = base_url + '/api/suppliers/' + supplierID + '/addresses/' + searchResponse[0].id
                        nlapiLogExecution('AUDIT', 'payloadJSON: ', JSON.stringify(payloadJSON));
                        putResponse = nlapiRequestURL(putURL, JSON.stringify(payloadJSON), headers, 'PUT');
                        if (putResponse.getCode() == '201' || putResponse.getCode() == '200') {
                            var putResponseJSON = JSON.parse(putResponse.getBody());
                            nlapiLogExecution('AUDIT', 'Successfully updated Supplier RTA in Coupa ', 'external-src-ref: ' + payloadJSON["external-src-ref"] + ' remit-to-code: ' + payloadJSON["remit-to-code"]);
                        } else {
                            nlapiLogExecution('AUDIT', 'Failed to update RTA to Coupa', 'Response Code: ' + putResponse.getCode() + ' postResponse : ' + putResponse.getBody());
                        }
                    }
                }
            } else {
                nlapiLogExecution('AUDIT', 'Skipped syncing Remit To Address.', 'No Default Shipping Address found in the Address sublist');
            }
        } else {
            nlapiLogExecution('AUDIT', 'Skipped syncing Remit To Address.', 'No Addresses found in the Address sublist');
        }
    } catch (e) {
        nlapiLogExecution('ERROR', 'Error in createRTA: ', JSON.stringify(e));
    }
}

/**
 * NIB-392 Sync Subsidiary as content group. The function below returns the list of Subsidiaries selected in subsidiary sublist
 * @param vendorRecord
 * @return {*[]}
 */
function getSubsidiaryList(vendorRecord) {
    var subsidiaryArray = [];
    var length = vendorRecord.getLineItemCount('submachine');
    for (var i = 1; i <= length; i++) {
        subsidiaryArray.push(vendorRecord.getLineItemText("submachine", "subsidiary", i));
    }
    return subsidiaryArray
}

/**
 * NIB-392 Sync Subsidiary as content group. The function below generates the XML payload for Subsidiaries selected in subsidiary sublist
 * @param vendorRecord
 * @return {string}
 */
function getContentGroupXML(vendorRecord, contentGroupMap) {
    var subsidiaryArray = getSubsidiaryList(vendorRecord);
    nlapiLogExecution("DEBUG", "subsidiaryArray in getContentGroupXML: ", JSON.stringify(subsidiaryArray));
    var xmlString = "<content-groups type=\"array\">";
    for (var i = 0; i < subsidiaryArray.length; i++) {
        if (contentGroupMap[subsidiaryArray[i]] != undefined) {
            xmlString += "<content-group><name>" + convertCDATA(contentGroupMap[subsidiaryArray[i]]) + "</name></content-group>"
        } else {
            nlapiLogExecution("AUDIT", "No Content Group found in the Script Parameter matching subsidiary: " + subsidiaryArray[i]);
        }
    }
    xmlString += "</content-groups>"
    return xmlString
}

/**
 * NIB-392 Clears out Everyone Content Group before adding CG
 * @param supplierId
 * @return {boolean}
 */
function clearEveryoneContentGrp(supplierId) {
    var successFlag = false;
    var oidcHeader = getAPIHeader('text/xml'); //NIB# 331 Get OIDC API Header
    var headers = new Array();
    if (oidcHeader) {
        headers = oidcHeader;
    } 
    if (supplierId != "" && supplierId != null) {
        // Need to clear out Everyone Content Group
        var everyoneUrl = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url') + '/api/suppliers/' + supplierId + '/business_groups/1/remove';
        var everyonePayload = '<supplier><content-groups></content-groups></supplier>';
        var contentResponse = nlapiRequestURL(everyoneUrl, everyonePayload, headers, 'PUT');

        if (contentResponse.getCode() == '200') {
            successFlag = true;
            nlapiLogExecution("AUDIT", "Successfully cleared Everyone content group from SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
        } else {
            nlapiLogExecution("ERROR", "Failure to clear Everyone content group from SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
        }
    }
    return successFlag
}

/**
 * Create Map based on the mapping provided in script parameter
 * @param contentGroupMapping
 * @param contentGroupFlag
 * @return {{}}
 */
function getParameterMap(contentGroupMapping, contentGroupFlag) {
    var contentGroupMap = {};
    if (contentGroupFlag) {
        var outerSplits = contentGroupMapping.split(";");
        for (var i = 0; i < outerSplits.length; i++) {
            var innerSplits = outerSplits[i].split("==");
            if (innerSplits && innerSplits.length > 1) {
                contentGroupMap[innerSplits[0]] = innerSplits[1];
            }
        }
    }
    nlapiLogExecution("AUDIT", "contentGroupMap: ", JSON.stringify(contentGroupMap));
    return contentGroupMap;
}

/**
 * NIB-392 Updates the supplier created with the Content Group based on the Deployment parameter
 * @param record
 * @param externalid
 */
function syncContentGroups(record, externalid) {
    // Setting up Headers
    var oidcHeader = getAPIHeader('text/xml'); //NIB# 331 Get OIDC API Header
    var headers = new Array();
    if (oidcHeader) {
        headers = oidcHeader;
    } 

    syncSubsAsCustomField(record, externalid);
    var contentGroupMap;
    var url = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url') + '/api/suppliers/' + externalid;
    var supplierId = externalid;
    var contentGroupFlag = context.getSetting('SCRIPT', 'custscript_vendor_content_grp_mapping') && context.getSetting('SCRIPT', 'custscript_vendor_content_grp_mapping').length > 0 ? true : false;
    var contentGroupParam = context.getSetting('SCRIPT', 'custscript_vendor_content_grp_mapping');
    contentGroupMap = getParameterMap(contentGroupParam, contentGroupFlag);
    if (contentGroupFlag && contentGroupParam) {
        if (contentGroupMap && Object.keys(contentGroupMap).length > 0) {
            try {
                var successFlag = true,
                    contentResponse = "";

                //Primary & secondary subsidiary synced as Content group
                var putData = "<?xml version='1.0' encoding='UTF-8'?><supplier><id>" + externalid + "</id>";

                putData += getContentGroupXML(record, contentGroupMap);
                var blankPutData = "<supplier><content-groups></content-groups></supplier>";
                initialResponse = nlapiRequestURL(url, blankPutData, headers, 'PUT');
                if (initialResponse.getCode() != '200') {
                    successFlag = false;
                    nlapiLogExecution("ERROR", "Failure to remove Previously synced Content Group before Updating the Content Groups for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                } else {
                    nlapiLogExecution("DEBUG", "Successfully updated content group for SupplierID " + supplierId, "Response Code: " + initialResponse.getCode());
                }

                putData += "</supplier>";

                nlapiLogExecution("AUDIT", "Content Group Payload:  ", putData);
                nlapiLogExecution("AUDIT", "URL:  ", url);
                radioButtonSelected = clearEveryoneContentGrp(externalid);
                if (radioButtonSelected) {
                    if (successFlag) {
                        contentResponse = nlapiRequestURL(url, putData, headers, 'PUT');
                        if (contentResponse.getCode() == '200') {
                            nlapiLogExecution("AUDIT", "Successfully updated content group for SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
                        } else {
                            nlapiLogExecution("ERROR", "Failure to update Everyone content group for SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
                            nlapiLogExecution("ERROR", "Response Body", contentResponse.getBody());
                        }
                    } else {
                        nlapiLogExecution("ERROR", "Failure to remove previously updated Content Groups", "Response Code: " + initialResponse.getCode() + " Response Data: " + initialResponse.getBody());
                        nlapiLogExecution("ERROR", "Response Body", initialResponse.getBody());
                    }
                } else {
                    nlapiLogExecution('AUDIT', 'Skipped setting Content-Group Failed to check "Only members of these content groups": ', "Response From clearEveryoneContentGrp(): " + radioButtonSelected);
                }
            } catch (e) {
                nlapiLogExecution("ERROR", "Uncaught Error in syncContentGroups()", JSON.stringify(e));
                nlapiLogExecution("DEBUG", "Uncaught Error in syncContentGroups()", e);
            }
        } else {
            nlapiLogExecution('AUDIT', 'Skipped setting Content-Group: ', "Content Group Mapping not available in Script Parameter");
        }
    } else {
        nlapiLogExecution('AUDIT', 'Skipped setting Content-Group: ', "Content Group Mapping not available in Script Parameter");
    }
}

/**
 * NIB-419 Updates the custom field on supplier created with the subsidiary selected on NetSuite vendor
 * @param record
 * @param externalid
 */
function syncSubsAsCustomField(record, externalid) {
    // Setting up Headers
    var headers = new Array(),
        contentResponse = "";

    var oidcHeader = getAPIHeader('text/xml'); //NIB# 331 Get OIDC API Header
    if (oidcHeader) {
        headers = oidcHeader;
    }

    var contentGroupMap;
    var url = nlapiGetContext().getSetting('SCRIPT', 'custscript_coupa_oidc_client_url') + '/api/suppliers/' + externalid;
    var putData = "<?xml version='1.0' encoding='UTF-8'?><supplier><id>" + externalid + "</id> <custom-fields>";
    var supplierId = externalid;
    try {
        //NIB# NIB-419
        var customField = context.getSetting('SCRIPT', 'custscript_vendor_subs_to_cust_field');
        if (customField && customField != "" && customField != undefined && customField != null) {
            var subsidiaryArray = getSubsidiaryList(record);
            nlapiLogExecution("AUDIT", "subsidiaryArray:", JSON.stringify(subsidiaryArray));
            if (subsidiaryArray && customField != "" && subsidiaryArray.length > 0) {
                putData += "<" + customField + ">" + convertCDATA(subsidiaryArray.join(";")) + "</" + customField + ">"
                putData += " </custom-fields></supplier>";
                nlapiLogExecution("AUDIT", "Content Group Payload:  ", putData);
                nlapiLogExecution("AUDIT", "URL:  ", url);
                contentResponse = nlapiRequestURL(url, putData, headers, 'PUT');
                if (contentResponse.getCode() == '200') {
                    nlapiLogExecution("AUDIT", "Successfully updated custom field with ID:" + customField + "  for SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
                } else {
                    nlapiLogExecution("ERROR", "Failure to update custom field with subsidiary for SupplierID " + supplierId, "Response Code: " + contentResponse.getCode());
                    nlapiLogExecution("ERROR", "Response Body", contentResponse.getBody());
                }
            }
        } else {
            nlapiLogExecution('AUDIT', 'Skipped setting Custom field with subsidiary list: ', "");
        }
    } catch (e) {
        nlapiLogExecution("ERROR", "Uncaught Error in syncSubsAsCustomField()", JSON.stringify(e));
        nlapiLogExecution("DEBUG", "Uncaught Error in syncSubsAsCustomField()", e);
    }
}