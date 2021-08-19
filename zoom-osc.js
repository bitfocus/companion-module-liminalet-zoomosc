//Liminal ZoomOSC Plugin for BitFocus Companion
var instance_skel = require('../../instance_skel');
var OSC 					= require('osc');
//API file
var ZOSC=require('./internalconstants.js');
//Icons file
var ZOSC_ICONS=require('./zoscicons.js');
var debug;
var log;

const PING_TIME_ERR = 15000;
const PING_TIMEOUT	= 3000;
const LIST_TIMEOUT  = 2000;
//default network settings
const DEF_TX_PORT	  = '9090';
const DEF_TX_IP		  = '127.0.0.1';
const DEF_RX_PORT	  = '1234';

const ZOOM_MAX_GALLERY_SIZE_Y = 7;
const ZOOM_MAX_GALLERY_SIZE_X = 7;

function instance(system, id, config) {
	console.log("INSTANCE");
	this.userList={};
	var self = this;
	//user data
	self.user_data={};
	//contains data from connected ZoomOSC instance
	self.zoomosc_client_data										 = [];
	self.zoomosc_client_data.last_ping					 = 0;
	self.zoomosc_client_data.last_list					 = 0;
	self.zoomosc_client_data.subscribeMode			 = 0;
	self.zoomosc_client_data.galleryShape				 = [0,0];
	//self.zoomosc_client_data.oldgalleryShape		 = [0,0];
	self.zoomosc_client_data.activeSpeaker			 = "None";
	self.zoomosc_client_data.activeSpeaker_zoomID    = -1;
	self.zoomosc_client_data.zoomOSCVersion			 = "Not Connected";
	self.zoomosc_client_data.subscribeMode			 =	0;
	self.zoomosc_client_data.galTrackMode				 =	0;
	self.zoomosc_client_data.callStatus					 =	0;
	self.zoomosc_client_data.numberOfTargets		 =	0;
	self.zoomosc_client_data.numberOfUsersInCall =	0;
	self.zoomosc_client_data.listIndexOffset = 0;
	self.zoomosc_client_data.numberOfSelectedUsers = 0;
	self.variable_data = {};
	self.variable_data_delta = {};
	self.variable_definitions = [];

	self.spotlit_users = new UserArray();
	self.pin1_users = new UserArray();
	self.pin2_users = new UserArray();
	self.selected_users = new UserArray();
	self.favorite_users = new UserArray();

	self.disabled=false;
	self.pingLoop={ };
	// super-constructor
	instance_skel.apply(this, arguments);
	Object.assign(this, {
		...feedbacks
	});
	self.actions(); // export actions
	self.init_presets();

	self.init_send_subscribe();

	return self;
}

/**
 * Class for ZoomID-based arrays with mutation utilities.
 */
class UserArray extends Array {
	/*constructor(...args) {
		super(...args);
		//this.prev_array = undefined;
	}*/
	clear() { this.length = 0; }
	add(element) { if (!this.includes(element)) this.push(element); }
	remove(element) { if (this.includes(element)) this.splice(this.indexOf(element), 1); }
	toggle(element) {
		if (this.includes(element)) this.remove(element);
		else this.add(element);
	}
	replaceAll(elements) {
		this.prev_array = [...this];
		this.clear();
		this.push(elements);
	}
	get(index) {
		if (this.length > parseInt(index)) return this[parseInt(index)];
		else return -1;
	}
}

instance.prototype.init_send_subscribe= function() {
	var self = this;
	//Subscribe to ZoomOSC
	self.system.emit('osc_send',
		self.config.host,				self.config.port,
		ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_SUBSCRIBE.MESSAGE,
		{type: 'f', value: parseFloat(self.config.subscribeMode)}
	);
	//set participant reporting mode
	self.system.emit('osc_send',
		self.config.host,				self.config.port,
		ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE,
		{type: 'i', value: parseInt(self.config.participantReportingMode)}
	);

};

instance.GetUpgradeScripts = function() {
	return [
		() => false, // placeholder script, that not cannot be removed
		instance_skel.CreateConvertToBooleanFeedbackUpgradeScript({
			'user_status_fb': true
		})
	];
};

instance.prototype.updateConfig = function(config) {
	console.log("updateConfig");
	var self = this;
	self.config = config;
	self.init_osc();
	self.init_presets();
	self.actions();
	//Subscribe to ZoomOSC
		self.system.emit('osc_send',
			self.config.host,				self.config.port,
			ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_SUBSCRIBE.MESSAGE,
			 {type: 'f', value: parseFloat(self.config.subscribeMode)}
		);
		//set participant reporting mode
		self.system.emit('osc_send',
			self.config.host,				self.config.port,
			ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE,
			{type: 'i', value: parseInt(self.config.participantReportingMode)}
		);
};


instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	this.disabled=false;
	self.init_osc();
	self.status(self.STATUS_UNKNOWN, "Initalizing");
	self.init_variables(true);
	self.init_ping();
	self.init_feedbacks();
	self.init_presets();

};

instance.prototype.userSourceList= {
	userName:        {varName:'userName',						varString:'user',							varLabel:''},
	index:           {varName:'index',							 varString:'tgtID',						 varLabel:'Target ID'},
	galleryIndex:    {varName:'galleryIndex',				varString:'galInd',						varLabel:'Gallery Index'},
	galleryPosition: {varName:'galleryPosition',		 varString:'galPos',						varLabel:'Gallery Position'},
	listIndex:       {varName:'listIndex',		 varString:'listIndex',						varLabel:'List Index'},
	favoriteIndex:   {varName:'favoritesIndex',	 varString:'favoritesIndex',		    varLabel:'Favorites (Index)'},
	selectionIndex:  {varName:'selectionIndex',	 varString:'selectionIndex',		    varLabel:'Selection (Index)'},
	spotlightIndex:  {varName:'spotlightIndex',	 varString:'spotlightIndex',		    varLabel:'Spotlight (Index)'},
	pin1Index:       {varName:'pin1Index',	     varString:'pin1Index',		            varLabel:'Pin Screen 1 (Index)'},
	me:              {varName:'me',              varString:'me',                     varLabel:'Me'}};

//variable name in user data, string to tag companion variable
instance.prototype.variablesToPublishList={
	index: {varName: 'index',						varString:'index',					 varLabel:"Target ID"},
	userName: {varName: 'userName',						varString:'userName',					 varLabel:"User Name"},
	galleryIndex: {varName: 'galleryIndex',				varString:'galIndex',					 varLabel:'Gallery Index'},
	roleText: {varName: 'roleText',						varString:'role',							 varLabel:'Role'},
	/*onlineStatusText: {varName: 'onlineStatusText',		varString:'onlineStatus',			 varLabel:'Online Status'},
	videoStatusText: {varName: 'videoStatusText',		  varString:'videoStatus',			 varLabel:'Video Status'},
	audioStatusText: {varName: 'audioStatusText',		  varString:'audioStatus',			 varLabel:'Audio Status'},
	spotlightStatusText: {varName: 'spotlightStatusText', varString:'spotlightStatus',	 varLabel:'Spotlight Status'},
	handStatusText: {varName: 'handStatusText',			 varString:'handStatus',				 varLabel:'Hand Status'},
	activeSpeakerText: {varName: 'activeSpeakerText',	   varString:'activeSpeaker',		 varLabel:'Active Speaker'},
	selected: {varName: 'selected',		 				 varString:'selected',						varLabel:'Selected'},*/
	currentCameraDevice: {varName: 'currentCameraDevice', varString:'currentCameraDevice',     varLabel:"Camera Device",     isList:false},
	currentMicDevice: {varName: 'currentMicDevice',    varString:'currentMicDevice',        varLabel:"Microphone Device", isList:false},
	currentSpeakerDevice: {varName: 'currentSpeakerDevice',varString:'currentSpeakerDevice',    varLabel:"Speaker Device",    isList:false},
	currentBackground: {varName: 'currentBackground',   varString:'currentBackground',       varLabel:"Background",        isList:false},
	cameraDevices: {varName: 'cameraDevices',      varString:'cameraDevices',     varLabel:"Camera Device",     isList:true},
	micDevices: {varName: 'micDevices',         varString:'micDevices',        varLabel:"Microphone Device", isList:true},
	speakerDevices: {varName: 'speakerDevices',     varString:'speakerDevices',    varLabel:"Speaker Device",    isList:true}
	// backgrounds: {varName: 'backgrounds',        varString:'backgrounds',       varLabel:"Background",        isList:true}
};

instance.prototype.update_user_variables_subset = function (attribute, source, export_variables = false) {
	Object.values(this.user_data).forEach(user => { this.setVariablesForUser(user, source, attribute); });
	if (export_variables) this.export_variables();
};

instance.prototype.updateVariable = function(thisName, thisLabel, thisValue, thisZoomID = null) {
	var self = this;
	if (thisValue == null || thisValue == undefined) return;
	let thisDefinition = { label:thisLabel, name: thisName, zoomID: thisZoomID };

	if (!self.variable_definitions.some(e => e.name === thisName)) {

		console.log("Adding def: "+JSON.stringify(thisDefinition));
		self.variable_definitions.push(thisDefinition);
	}
	self.variable_data_delta[thisName] = thisValue;
	//self.debug("Updated var "+thisName+" to "+thisValue);
};

instance.prototype.export_variables = function() {
  this.setVariableDefinitions(this.variable_definitions);
  this.setVariables(this.variable_data_delta);
  this.variable_data = {...this.variable_data, ...this.variable_data_delta};
  this.variable_data_delta = {};
};

instance.prototype.clear_user_data = function () {
	this.init_variables(true, true);
	this.user_data = {};
	this.update_client_variables();
	this.export_variables();
	this.variable_data = {};
	this.variable_data_delta = {};
	this.variable_definitions = [];
	//this.checkFeedbacks();
};

instance.prototype.setVariablesForUser = function(sourceUser, userSourceList, variablesToPublishList, export_vars = false, clear = false){
	var self = this;
	//user name in user data, string to tag companion variable

	//variables
	for(var variableToPublish in variablesToPublishList){
		// sources
		for(var source in userSourceList){
			var thisSource=userSourceList[source];
			if (Array.isArray(sourceUser[thisSource.varName])) self.debug('found array var');
			//dont publish variables that are -1
			if(![-1, null].includes(sourceUser[thisSource.varName]) && !(Array.isArray(sourceUser[thisSource.varName]) && !sourceUser[thisSource.varName].length) && sourceUser.hasOwnProperty(variableToPublish)){
				var thisVariable=self.variablesToPublishList[variableToPublish];
				var thisVariableName=thisVariable.varName;
				//if it is a device list, add each device

					let listSize;
					if(thisVariable.isList && sourceUser[thisVariableName] != undefined){
						listSize=sourceUser[thisVariableName].length;

					}else{
						listSize=1;
					}
					//
					for(let i=0;i<listSize;i++){
									var thisFormattedVarLabel;
									var thisFormattedVarName;
									//if variable is a list add a number to each variable name and label
									if(thisVariable.isList){
										thisFormattedVarLabel=thisVariable.varLabel+' '+i+' for '+thisSource.varLabel+' '+sourceUser[thisSource.varName];
										thisFormattedVarName=thisVariable.varString+'_'+i+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName];
									} else if (thisSource.varName == 'me') {
										thisFormattedVarLabel=thisVariable.varLabel+' for '+thisSource.varLabel;
										thisFormattedVarName=thisVariable.varString+'_'+thisSource.varString;
									} else {
										thisFormattedVarLabel=thisVariable.varLabel+' for '+thisSource.varLabel+' '+sourceUser[thisSource.varName];
										thisFormattedVarName=thisVariable.varString+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName];
									}

									//clear all variables to '-' if not in a call
									var thisVariableValue, thisZoomID;
									if(!self.zoomosc_client_data.callStatus || clear){
										thisVariableValue='-';
										thisZoomID = null;
									}else{
										thisZoomID = sourceUser.zoomID;

										//if this is a list, populate with the device name
										if(thisVariable.isList && sourceUser[thisVariableName] != undefined && sourceUser[thisVariableName].length > 0) {
											thisVariableValue=sourceUser[thisVariableName][i].deviceName;
										}else{
											thisVariableValue=sourceUser[thisVariableName];
										}

									}

									//if the variable has a value push and set it
									if(thisVariableValue != null && thisVariableValue != undefined){
										//push variable and set
										self.updateVariable(thisFormattedVarName, thisFormattedVarLabel, thisVariableValue, thisZoomID);
										//self.setVariable( thisFormattedVarName, thisVariableValue);
									}

					}

				}
			}
		}
		if (export_vars) self.export_variables();
};

instance.prototype.remove_variables_for_user = function(zoomID, var_name_filter = undefined) {
	if (zoomID === undefined || zoomID === null) return;
	var self = this;
	let user_variable_definitions = self.variable_definitions.filter(e => e.zoomID == zoomID);
	if (var_name_filter != undefined) {
		user_variable_definitions = user_variable_definitions.filter(e => e.name.includes(var_name_filter));
	}
	let user_variable_names = user_variable_definitions.map(e => e.name);
	let user_variable_data = Object.keys(self.variable_data).filter(e => user_variable_names.includes(e));

	console.log("Removing zoomID", zoomID, "definitions: ", JSON.stringify(user_variable_definitions), "and data: ", user_variable_data);
	
	self.variable_definitions = self.variable_definitions.filter(e => user_variable_definitions.includes(e));

	user_variable_data.forEach(this_variable_name => {
		self.variable_data_delta[this_variable_name] = undefined;
	});
	
};

instance.prototype.remove_offline_users = function() {
	var self = this;
	let userRemoved = false;
	for(let user in self.user_data){
		//only remove users with no target IDs
		if(self.user_data[user].onlineStatus==0 && self.user_data[user].index == -1){
			console.log("Deleting offline user: "+user);
			self.remove_variables_for_user(user.zoomID);
			delete self.user_data[user];
			userRemoved= true;
		}
	}
	if (userRemoved) self.update_user_variables_subset(self.variablesToPublishList, [self.userSourceList.listIndex]);
};

/*instance.prototype.assign_gallery_positions = function (export_vars = false) {
	var self = this;
	if (self.zoomosc_client_data.galleryOrder === undefined) return;
	// GRID LAYOUT/calculate gallery position data
	var numRows=self.zoomosc_client_data.galleryShape[0];
	var numCols=self.zoomosc_client_data.galleryShape[1];

	var userIndex=0;

for(y=0;y<ZOOM_MAX_GALLERY_SIZE_Y;y++){
			for (x=0;x<ZOOM_MAX_GALLERY_SIZE_X;x++){
				// check which user is in gallery position
			for (let user in self.user_data){
					if(self.zoomosc_client_data.galleryOrder && self.user_data[user].zoomID==self.zoomosc_client_data.galleryOrder[userIndex]){
						//add gallery position to self.user_data
						self.user_data[user].galleryPosition=y.toString()+','+x.toString();
						// self.user_data[user].galleryIndex=userIndex;
					}
					else if(self.user_data[user].galleryIndex==-1){
						self.user_data[user].galleryPosition='-';
					}
			}
			//if we are in the gallery
				if(y<numRows&&x<numCols&&userIndex<self.zoomosc_client_data.galleryOrder.length){
					userIndex++;
			}
			//if gallery position is not in our gallery set blank values for variables
				else{
					//set variables as blank for gallery position
						for (let i=0;i<self.variablesToPublishList.length;i++){
							let thisFormattedVarName=self.variablesToPublishList[i].varString+'_galPos_'+y+','+x;
							// thisVariable.varString+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName]
							//self.setVariable( thisFormattedVarName,'-');
							self.variable_data[thisFormattedVarName] = '-';
							if ((thisVar = self.variable_definitions.filter(e => e.name === thisFormattedVarName)).length > 0) {
								thisVar[0].zoomID = null;  // Dissociate a user from this gallery position
							}
						}
				}
		}
	}

	self.zoomosc_client_data.oldgalleryShape = Object.assign({}, self.zoomosc_client_data.galleryShape);
	if (export_vars) self.export_variables();
};*/

instance.prototype.clear_user_gallery_position = function(zoomID, export_vars = false) {
	var self = this;
	//clears variables from previously assigned gallery position (if present)
	if (self.user_data[zoomID].galleryPosition) {
		self.setVariablesForUser(
			self.user_data[zoomID], 
			[self.userSourceList.galleryIndex,	
			 self.userSourceList.galleryPosition],
			self.variablesToPublishList,
			false,
			true);
		self.user_data[zoomID].galleryPosition = '-';
	}

	if (export_vars) self.export_variables();
};

instance.prototype.assign_user_gallery_position = function(zoomID, gallery_index = undefined, export_vars = false) {
	var self = this;

	//assigns new gallery position from math with galleryIndex and number of columns in window
	//var numRows=self.zoomosc_client_data.galleryShape[0];
	if (gallery_index == undefined && self.zoomosc_client_data.galleryOrder.includes(Number(zoomID))) {
		gallery_index = self.zoomosc_client_data.galleryOrder.indexOf(Number(zoomID));
	}
	if (gallery_index != undefined) {
		let numCols=self.zoomosc_client_data.galleryShape[1];
		self.user_data[zoomID].galleryPosition = Math.floor(gallery_index/numCols) + "," + gallery_index % numCols;
		self.user_data[zoomID].galleryIndex = gallery_index;
		//console.log('galPos for user', zoomID, thisGalleryIndex, numCols);
		self.setVariablesForUser(
			self.user_data[zoomID], 
			[self.userSourceList.galleryIndex,	
			 self.userSourceList.galleryPosition],
			self.variablesToPublishList,
			false);
	}

	if (export_vars) self.export_variables();
};

//Client variable definitions
instance.prototype.clientdatalabels = {
	zoomOSCVersion:'ZoomOSC Version',
	subscribeMode:'Subscribe Mode',
	participantReportingMode:'Participant Reporting Mode',
	callStatus :'Call Status',
	numberOfTargets:'Number of Targets',
	numberOfUsersInCall: 'Number of Users in Call',
	activeSpeaker:'Active Speaker',
	listIndexOffset:'Current List Index Offset',
	numberOfSelectedUsers:'Number of users in Selection group',
	numberOfFavoriteUsers:'Number of users in Favorites group',
	numberOfVideoOn:'Number of participants with video on',
	numberOfUnmuted:'Number of participants unmuted',
	numberOfRaisedHands:'Number of participants with raised hands',
	numberOfSpotlitUsers:'Number of spotlit participants',
	numberOfPin1Users:'Number of pinned participants',
	numberOfCohosts:'Number of Co-hosts and Hosts',
	numberOfAttendees:'Number of attendees',
	numberOfPanelists:'Number of panelists',
	selectedUsersList:'A list of all usernames currently selected',
	favoriteUsersList:'A list of all usernames currently favorited',
};

instance.prototype.update_client_variables = function(client_variable_labels = undefined, export_vars = false) {
	var self = this;
	var clientVarVal=0;

	if (client_variable_labels == undefined) client_variable_labels = self.clientdatalabels;

	for(let clientVar in client_variable_labels){
		//ZoomOSC Version
		switch(clientVar){
			case 'listIndexOffset':
			case 'zoomOSCVersion':
			case 'callStatus':
			case 'numberOfTargets':
			case 'numberOfUsersInCall':
			case 'activeSpeaker':
				clientVarVal=self.zoomosc_client_data[clientVar];
				break;
			case 'subscribeMode':
				switch(self.zoomosc_client_data[clientVar]){

					case ZOSC.enums.SubscribeModeNone:
						clientVarVal='None';
						break;

					case ZOSC.enums.SubscribeModeTargetList:
						clientVarVal='Target List';
						break;

					case ZOSC.enums.SubscribeModeAll:
						clientVarVal='All';
						break;

					case ZOSC.enums.SubscribeModePanelists:
						clientVarVal='Panelists';
						break;

					case ZOSC.enums.SubscribeModeOnlyGallery:
						clientVarVal='Only Gallery';
						break;

					default:
						break;
					}
				break;

				case 'participantReportingMode':
					switch(self.zoomosc_client_data[clientVar]){

						case ZOSC.enums.ParticipantReportingModeTargetIndex:
							clientVarVal='Target Index';
							break;

						case ZOSC.enums.ParticipantReportingModeZoomID:
							clientVarVal='ZoomID';
							break;

						default:
							break;
						}
					break;
				case 'numberOfSelectedUsers':
					clientVarVal = self.selected_users.length;
					break;
				case 'numberOfFavoriteUsers':
					clientVarVal = self.favorite_users.length;
					break;
				case 'selectedUsersList':
					clientVarVal = self.selected_users.map(zoomID => this.user_data[zoomID] != undefined ? this.user_data[zoomID].userName : '').join(', ');
					break;
				case 'favoriteUsersList':
					clientVarVal = self.favorite_users.map(zoomID => this.user_data[zoomID].userName).join(', ');
					break;
				case 'numberOfSpotlitUsers':
					clientVarVal = self.spotlit_users.length;
					break;
				case 'numberOfPin1Users':
					clientVarVal = self.pin1_users.length;
					break;
				case 'numberOfVideoOn':
					clientVarVal = Object.values(self.user_data).filter(user => user.videoStatus).length;
					break;
				case 'numberOfUnmuted':
					clientVarVal = Object.values(self.user_data).filter(user => user.audioStatus).length;
					break;
				case 'numberOfRaisedHands':
					clientVarVal = Object.values(self.user_data).filter(user => user.handStatus).length;
					break;
				case 'numberOfCohosts':
					clientVarVal = Object.values(self.user_data).filter(user => user.role == 1 || user.role == 2).length;
					break;
				case 'numberOfAttendees':
					clientVarVal = Object.values(self.user_data).filter(user => user.role == 5).length;
					break;
				case 'numberOfPanelists':
					clientVarVal = Object.values(self.user_data).filter(user => user.role == 3).length;
					break;
				default:
					break;

			}
		//self.setVariable('client_'+clientVar,clientVarVal);
		self.updateVariable('client_'+clientVar, client_variable_labels[clientVar], clientVarVal);
	}
	if (export_vars) self.export_variables();
};

//Initialize variables
instance.prototype.init_variables = function(export_vars = false, clear = false) {
	var self = this;
	self.debug(clear ? "Running init_variables with clear parameter" : "Running init_variables");
	//print list of users
	// console.log("USERS: "+JSON.stringify(self.user_data));
	// self.log('debug',"USERS: "+JSON.stringify(self.user_data))

	//self.assign_gallery_positions(false);

	//set gallery position and index variables to '-' to show that they're valid 
	if (!clear) {
		for (let row = 0; row < 7; row++) {
			for (let col = 0; col < 7; col++) {
			self.setVariablesForUser({
				galleryIndex: (row*7)+col,
				galleryPosition: row+','+col,
				userName: '-'},  
				[self.userSourceList.galleryIndex,
				self.userSourceList.galleryPosition],
				{userName: self.variablesToPublishList.userName}, false, true);
			}
		}
	}

	//clear all variables from list of users
	if (clear) {
		let user_data_values = Object.values(self.user_data);
		if(user_data_values.length>0){
			Object.values(self.user_data).forEach(user => 
				self.setVariablesForUser(user,self.userSourceList,self.variablesToPublishList, false, clear));
			self.debug("Clearing variables for", user_data_values.length, "participants");
		}
	}

	self.update_client_variables(false);

	if (export_vars) self.export_variables();
};


//INSTANCE IN COMPANION CONFIG
instance.prototype.config_fields = function() {
	var self = this;
	return [{

			type:	'text',
			id:		'info',
			width: 12,
			label: 'Information',
			value: "ZoomOSC opens a bidirectional Open Sound Control interface to Zoom.<br> This integration creates easy access to ZoomOSC's control commands and also exposes a set of variables that will be automatically updated by ZoomOSC during the meeting. <br>More information at <a href='https://www.liminalet.com/zoomosc' target='_new'>liminalet.com/zoomosc</a>"
		},
		{
			type:	'textinput',
			id:		'host',
			label: 'Target IP',
			width: 8,
			regex: self.REGEX_IP,
			default: DEF_TX_IP
		},
		{
			type:	'textinput',
			id:		'port',
			label: 'Target Port',
			width: 4,
			regex: self.REGEX_PORT,
			default:DEF_TX_PORT
		},
		{
			type:	'textinput',
			id:		'feedbackPort',
			label: 'Feedback Port',
			width: 4,
			regex: self.REGEX_PORT,
			default:DEF_RX_PORT
		},

		{
			type: 'dropdown',
			id:	 'subscribeMode',
			label: 'Subscribe Mode',
			choices:[
				{id: ZOSC.enums.SubscribeModeNone,					 label: 'None'						 },
				{id: ZOSC.enums.SubscribeModeTargetList,		 label: 'Target List'			},
				{id: ZOSC.enums.SubscribeModeAll,						label: 'All'							},
				{id: ZOSC.enums.SubscribeModePanelists,			label: 'Panelists'				},
				{id: ZOSC.enums.SubscribeModeOnlyGallery,		label: 'Only Gallery'		 }
			],
			default: ZOSC.enums.SubscribeModeAll
		},
		{
			type: 'dropdown',
			id:	 'participantReportingMode',
			label: 'Participant Reporting Mode ---ZOOMID MODE REQUIRED FOR MOST FEATURES---',
			choices:[
				{id: ZOSC.enums.ParticipantReportingModeTargetIndex, label: 'Target Index'},
				{id: ZOSC.enums.ParticipantReportingModeZoomID,			label: 'ZoomID'			}

			],
			default: ZOSC.enums.ParticipantReportingModeZoomID
		}
	];
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	console.log("DESTROY");
	self.listener.close();
	self.disabled=true;
	clearTimeout(self.pingLoop);
	debug('destroy');
};

//ACTIONS IN COMPANION CONFIG
instance.prototype.actions = function(system) {
	var self = this;
	var allInstanceActions=[];

	//get list of users
	this.userList={
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET,
			label:'--Target Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX,
			label:'--Gallery Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
			label: '--Gallery Position--'
			},
		[ZOSC.keywords.ZOSC_MSG_PART_ME]:{
			id:ZOSC.keywords.ZOSC_MSG_PART_ME,
			label:'--Me--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_LIST_INDEX]:{
			id:"listIndex",
			label: '--List Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_GROUP]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_GROUP,
			label:'--Selection Group--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_INDEX]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_INDEX,
			label:'--Selection Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_GROUP]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_GROUP,
			label:'--Favorites Group--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_INDEX]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_INDEX,
			label:'--Favorites Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_GROUP]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_GROUP,
			label:'--Spotlight Group--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_INDEX]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_INDEX,
			label:'--Spotlight Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_GROUP]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_GROUP,
			label:'--Screen 1 Pin Group--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_INDEX]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_INDEX,
			label:'--Screen 1 Pin Index--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN2_GROUP]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN2_GROUP,
			label:'--Screen 2 Pin User--'
			},
		[ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME]:{
			id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME,
			label: '--Specify Username--'
			}
	};
	//loop through user data to get usernames
	if(Object.keys(self.user_data).length>0){
		// console.log("USERS EXIST");
		for(let user in self.user_data){
			var this_user=[];
			this_user={id:self.user_data[user].userName,label:self.user_data[user].userName};
			this.userList[self.user_data[user].userName]=this_user;
		}
	}

//user actions
	var userActions=[];
	//Groups are actions
	for (let userActionGroup in ZOSC.actions){
		var thisGroup=ZOSC.actions[userActionGroup];
		//actions in groups
		var groupActions=[];
		for (let action in thisGroup.MESSAGES) {
			var thisAction=thisGroup.MESSAGES[action];
			var newAction={};
			newAction.id=action;
			newAction.label = thisAction.TITLE;
			groupActions.push(newAction);
		}
		var newGroup={};
		//app action group has different interface
		if(userActionGroup=='APP_ACTION_GROUP' || userActionGroup=='CUSTOM_OSC_GROUP'){
			newGroup={
				id:		 thisGroup.TITLE,
				label:	thisGroup.TITLE,
				options:[
					{
						type:'dropdown',
						label:'Message',
						id:'message',
						choices:groupActions,
						default:groupActions[0].id,
						minChoicesForSearch: 0
					}
				]
			};
			}
			else{
				newGroup={
					id:		 thisGroup.TITLE,
					label:	thisGroup.TITLE,
					options:[

						{
							type:'dropdown',
							label:'Message',
							id:'message',
							choices:groupActions,
							default:groupActions[0].id,
							minChoicesForSearch: 0
						},
						{
							type:'dropdown',
							label:'User',
							id:'user',
							choices:this.userList,
							default:'me',
							minChoicesForSearch: 0
						},
						{
							type:'textinput',
							label:'User Identifier',
							id:'userString'
						}
					]
				};
			}

			// split arguments
		let argsRaw = thisGroup.ARGS.split(',');

		let args = argsRaw.reduce((accumelated_args, element, _, __) => {
			// console.log("arg is " + element)
			let parts = element.split(':');
			let types = parts[0].split('|');
			return [...accumelated_args, {types: types, name: parts[1]}]; //combine accumelated_args with new arg
		}, []);

		// console.log('ARGS: '+ args);
		//add arguments
		for (let arg in args) {
			switch(args[arg].types.toString().trim()){
				case 'string':
				newGroup.options.push({
					type: 'textinput',
					label: args[arg].name,
					id: args[arg].name,
					default: ""
				});
				break;

				case 'int':
				newGroup.options.push({
					type: 'number',
					label: args[arg].name,
					id: args[arg].name,
					min:0,
					max:Math.pow(2, 16),
					default:1
				});
					break;

				case 'list':
				newGroup.options.push({
					type: 'number',
					label: args[arg].name,
					id: args[arg].name,
					min:0,
					max:1000,
					default:1
				});
					break;

				case 'path':
					newGroup.options.push({
						type: 'textinput',
						label: args[arg].name,
						id: args[arg].name,
						default: "/zoom/ping"
					});
					break;

				default:
					break;
			}
		}
				 //add action to action list
	allInstanceActions[userActionGroup]=newGroup;

	}
//set actions in ui
	allInstanceActions.listIndexOffset = {
		id:		 "listIndexOffset",
		label:	"List Index Offset",
		options:[
			{
				type:'dropdown',
				label:'offset type',
				id:'offsetType',
				choices:[{label:'To index', id: 'toIndex'}, {id: 'increase', label:'increase by'}, {id: 'decrease', label: 'decrease by'}],
				default:'toIndex'
			}, {
				type: 'number',
				label: "value",
				id: "value",
				min:0,
				max:1000,
				default:1
			}
		]
	};
	self.system.emit('instance_actions', self.id,allInstanceActions);

};

////ACTIONS
instance.prototype.action = function(action) {
	var self = this;
	var args = [];
	var path = null;
	// console.log("action", action);

	if (action.action == 'listIndexOffset')
	{
		// console.log("GOT LIST INDEX OFFSET" + action.options.offsetType);
		switch (action.options.offsetType) {
			case 'toIndex':
				self.zoomosc_client_data.listIndexOffset = Math.max(0, parseInt(action.options.value));
				break;
			case 'increase':
				self.zoomosc_client_data.listIndexOffset = Math.max(0, self.zoomosc_client_data.listIndexOffset + parseInt(action.options.value));
				break;
			case 'decrease':
				self.zoomosc_client_data.listIndexOffset = Math.max(0, self.zoomosc_client_data.listIndexOffset - parseInt(action.options.value));
				break;

		}
		self.update_user_variables_subset(
			self.variablesToPublishList, 
			[self.userSourceList.listIndex]);
		return;
	}

	//set target type
	var TARGET_TYPE=null;
	var userString=null;
	// console.log("SWITCH: ",action.options);
	switch(action.options.user){

		case ZOSC.keywords.ZOSC_MSG_PART_ME:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_PART_ME;
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX;
				userString=parseInt(action.options.userString);
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
				userString=parseInt(action.options.userString);
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_GROUP:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
				userString = self.selected_users;
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_GROUP:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.favorite_users;
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_GROUP:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.spotlit_users;
			break;
		
		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_GROUP:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.pin1_users;
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN2_GROUP:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.pin2_users;
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_INDEX:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.selected_users.get(action.options.userString);
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_INDEX:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.favorite_users.get(action.options.userString);
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_INDEX:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.spotlit_users.get(action.options.userString);
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_INDEX:
			TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
			userString = self.pin1_users.get(action.options.userString);
			break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET;
				userString=parseInt(action.options.userString);
				//console.log("TARGET: "+userString+ typeof userString);
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME;
				userString=action.options.userString;
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION;
				userString=action.options.userString;
				break;
		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_LIST_INDEX:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
				//switch to this so we spoof a zoomID message
				let index = parseInt(action.options.userString);
				index += self.zoomosc_client_data.listIndexOffset;

				var users = Object.keys(self.user_data);
				if (users.length > index)
				{
						userString= parseInt(self.user_data[users[index]].zoomID);
				} else { userString = -1; }

				break;
		default:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME;
				userString = action.options.user;
				break;
}


	var thisGroup=ZOSC.actions[action.action];
	var thisMsg=thisGroup.MESSAGES[action.options.message];
	// /zoom/[TARGET_TYPE]/[message]
	function pushOscArgs(){
	// add args

	let emptyArgAllowList = ['Meeting Password'];  // Send these args regardless of if they're empty
	let argDisallowList = ['message', 'user', 'userString']; // Never send these args (processed in another block)

	for (let arg in action.options){
		console.log("ARG: " + arg + ", " + action.options[arg] + ", " + 
			typeof action.options[arg] + ", " + JSON.stringify(action.options));

		if(!argDisallowList.includes(arg) && (action.options[arg].toString().length>0 || emptyArgAllowList.includes(arg))){
			var thisArg=action.options[arg];
			if(!isNaN(thisArg) && thisArg !== ""){
				thisArg=parseInt(thisArg);
			}
			if(arg.toString().toUpperCase().startsWith("MEETING NUMBER")) {
				thisArg = thisArg.toString().replaceAll(' ','');
			}
			console.log("IS ARG: " + arg + " (" + thisArg + "), type " + typeof thisArg);
			var oscArgType;
	//set osc type from js type
			switch(typeof thisArg){
				case 'number':
					oscArgType='i';
					console.log("ARG IS NUMBER");
					break;

				case 'string':
				case 'list':
					oscArgType='s';
					console.log("ARG IS STRING");
					break;

				default:
					break;
			}
				args.push({type:oscArgType,value:thisArg});
		}

	}
}

function pushCustomOSCArgs() {
	let arguments = action.options.Arguments.replace(/“/g, '"').replace(/”/g, '"').split(' ');
	let arg;

	if (arguments.length) {
		if (args == undefined) args = [];
	}

	for (let i = 0; i < arguments.length; i++) {
		if (arguments[i].length == 0)
			continue;   
		if (isNaN(arguments[i])) {
			let str_arg = arguments[i];
			if (str_arg.startsWith("\"")) {  //a quoted string..
				while (!arguments[i].endsWith("\"")) {
					i++;
					str_arg += " "+arguments[i];
				}
			}
			arg = {
				type: 's',
				value: str_arg.replace(/"/g, '').replace(/'/g, '')
			};
			args.push(arg);
		}
		else if (arguments[i].indexOf('.') > -1) {
			arg = {
				type: 'f',
				value: parseFloat(arguments[i])
			};
			args.push(arg);
		}
		else {
			arg = {
				type: 'i',
				value: parseInt(arguments[i])
			};
			args.push(arg);
		}
	}
}

if (action.action == 'CUSTOM_OSC_GROUP') {
	path = action.options.Path;
	pushCustomOSCArgs();
}

//handle user actions
if('USER_ACTION' in thisMsg && action.user!=ZOSC.keywords.ZOSC_MSG_PART_ME ){
	if (TARGET_TYPE == ZOSC.keywords.ZOSC_MSG_TARGET_PART_LIST_INDEX) TARGET_TYPE = ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
	if (Array.isArray(userString)) {
		if (userString.length > 0) {
			self.log('debug', "User action targeted group, but no users are in the group. No action was performed.");
			return;
		}
		path= '/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/users/'+TARGET_TYPE+'/'+thisMsg.USER_ACTION;
	} else {
		path= '/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/'+TARGET_TYPE+'/'+thisMsg.USER_ACTION;
	}
		//make user
	if(Array.isArray(userString)) { //covers selection, favorite, spotlight, and pin groups
		userString.forEach(id => args.push({type:'i',value:parseInt(id)}));
		self.debug("userString array: " + userString + ", args: " + JSON.stringify(args));

	} else if([ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX,
		  ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET,
		  ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID,
		  ZOSC.keywords.ZOSC_MSG_TARGET_PART_LIST_INDEX].includes(TARGET_TYPE)){
		args.push({type:'i',value:parseInt(userString)});

	} else if (TARGET_TYPE != ZOSC.keywords.ZOSC_MSG_PART_ME) {
		args.push({type:'s',value:userString});
	}

	if (action.action == 'CUSTOM_OSC_WITH_USER_GROUP') {
		path = path + action.options.Path;
		pushCustomOSCArgs();
	}


	pushOscArgs();

	debug('Sending OSC', self.config.host, self.config.port, path);
	console.log('sending osc');
	console.log(path);
	console.log(JSON.stringify(args));

	self.system.emit('osc_send', self.config.host, self.config.port, path, args);

	}
//General action messages just use the first part of the path
	else if('MESSAGE' in thisMsg||'GENERAL_ACTION' in thisMsg){
		if (path != undefined) {}
		else if('MESSAGE' in thisMsg){
			path = thisMsg.MESSAGE;
		}
		else if ('GENERAL_ACTION' in thisMsg){
			path = '/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/'+thisMsg.GENERAL_ACTION;
		}

//if there are no args to be sent just send the path
	if(thisMsg.ARG_COUNT<1 || args == undefined){
		console.log("Sending OSC: "+path+" "+args);
		self.system.emit('osc_send', self.config.host, self.config.port, path);
		}
	else{
		//push arguments and send full message
		// console.log(JSON.stringify(args));
		pushOscArgs();
		self.system.emit('osc_send', self.config.host, self.config.port, path, args);
		}
	}
	//TODO: finding a user needs to be a function as this code is repeated 3 times
	else if('INTERNAL_ACTION' in thisMsg){  // Selection Actions
		let selectedUser=null;
		if(!thisMsg.INTERNAL_ACTION.includes("clear")) {
				switch (TARGET_TYPE){
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
						//look for user with target position in userstring
						for (let user in self.user_data){
							if(self.user_data[user].index==parseInt(userString)){
								selectedUser=user;
							break;
							}
						}
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID:
						selectedUser = parseInt(userString);
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX:
						//look for user with gallery index in userstring
						for (let user in self.user_data){
							if(self.user_data[user].galleryIndex==userString){
								selectedUser=user;
							break;
							}
						}
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION:
						//look for user with gallery position in userString
						for (let user in self.user_data){
							if(self.user_data[user].galleryPosition==userString){
								selectedUser=user;
								break;
							}
						}
						break;
					case ZOSC.keywords.ZOSC_MSG_PART_ME:
						for (let user in self.user_data){
							if(self.user_data[user].me){
								selectedUser = user;
								break;
							}
						}
						break;
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
					default:
						//user isnt a target type, look for user with username in userstring
						for (let user in self.user_data){
							if(self.user_data[user].userName==userString){
								selectedUser=user;
								break;
							}	
						}
						break;
	}
}
	if (action.action == 'SELECTION_GROUP') {
		if (!["addSelection", "removeSelection", "toggleSelection", "singleSelection"].includes(thisMsg.INTERNAL_ACTION)) {
			switch(thisMsg.INTERNAL_ACTION){
				case "clearSelection":
					self.selected_users.forEach((_,index,__) => {
						self.setVariablesForUser(
							{	galleryIndex: undefined,
								galleryPosition: undefined,
								userName: undefined,
								selectionIndex: index},
							{selectionIndex: self.userSourceList.selectionIndex}, 
							self.variablesToPublishList, false, true);
					});
					self.favorite_users = new UserArray();
					//self.log('debug',"Clear selection");
					break;
				case 'addUnmutedToSelection':
					self.selected_users.push(
						...Object.values(self.user_data)
						.filter(user => user.audioStatus && self.selected_users.indexOf(user.zoomID) === -1)
						.map(user => user.zoomID));
					break;
				case 'addVideoOnToSelection':
					self.selected_users.push(
						...Object.values(self.user_data)
						.filter(user => user.videoStatus && self.selected_users.indexOf(user.zoomID) === -1)
						.map(user => user.zoomID));
					break;
				case 'addSpotlitToSelection':
					self.selected_users.push(
						...self.spotlit_users
						.filter(zoomID => self.selected_users.indexOf(zoomID) === -1));
					break;
				case 'addPin1ToSelection':
					self.selected_users.push(
						...self.pin1_users
						.filter(zoomID => self.selected_users.indexOf(zoomID) === -1));
					break;
				case 'addRaisedHandToSelection':
					self.selected_users.push(
						...Object.values(self.user_data)
						.filter(user => user.handStatus && self.selected_users.indexOf(user.zoomID) === -1)
						.map(user => user.zoomID));
					break;
				case 'addHostsToSelection':
					self.selected_users.push(
						...Object.values(self.user_data)
						.filter(user => (user.role == 1 || user.role == 2) && self.selected_users.indexOf(user.zoomID) === -1)
						.map(user => user.zoomID));
					break;
				case 'addFavoritesSelection':
					self.selected_users.push(
						...self.favorite_users
						.filter(zoomID => self.selected_users.indexOf(zoomID) === -1));
					break;
				case 'addAttendeesToSelection':
					self.selected_users.push(
						...Object.values(self.user_data)
						.filter(user => user.role == 5 && self.selected_users.indexOf(user.zoomID) === -1)
						.map(user => user.zoomID));
					break;
				case 'addParticipantsToSelection':
					clientVarVal = Object.values(self.user_data).filter(user => user.role == 3).length;
					break;
				default:
					break;
			}
		}
		if (isNaN(selectedUser)) {
			self.log("debug", "Unable to select " + TARGET_TYPE + " " + userString + ": offline users cannot be selected.");
		} else if (self.user_data[selectedUser] != undefined) {
			selectedUser = parseInt(selectedUser);
			switch(thisMsg.INTERNAL_ACTION){
				case "addSelection":
					self.selected_users.add(selectedUser);
					//self.log('debug', "Add selection to " + self.user_data[selectedUser].userName);
					break;
				case "removeSelection":
					self.selected_users.remove(selectedUser);
					//self.log('debug',"Remove selection from " + self.user_data[selectedUser].userName);
					break;
				case "toggleSelection":
					self.selected_users.toggle(selectedUser);
					//self.log('debug',"Toggle selection " + self.user_data[selectedUser].userName);
					break;
				case "singleSelection":
					self.selected_users.replaceAll([selectedUser]);
					//self.log('debug',"Single selection " + self.user_data[selectedUser].userName);
					break;
				default:
					break;
			}
			if (self.selected_users.indexOf(selectedUser) == -1 && (thisMsg.INTERNAL_ACTION == "removeSelection" || thisMsg.INTERNAL_ACTION == "toggleSelection")) {
				self.setVariablesForUser(
					{	galleryIndex: undefined,
						galleryPosition: undefined,
						userName: undefined,
						selectionIndex: self.selected_users.length},
					{selectionIndex: self.userSourceList.selectionIndex}, 
					self.variablesToPublishList, false, true);
			}
		}
		self.update_user_variables_subset(self.variablesToPublishList, {selectionIndex: self.userSourceList.selectionIndex}, false);
		self.update_client_variables({
			numberOfSelectedUsers: self.clientdatalabels.numberOfSelectedUsers,
			selectedUsersList: self.clientdatalabels.selectedUsersList}, true);
		this.checkFeedbacks();
		return;
	} else if (action.action == 'FAVORITES_GROUP') {
		if (thisMsg.INTERNAL_ACTION == "clearFavorites") {
			self.favorite_users.forEach((_,index,__) => {
				self.setVariablesForUser(
					{	galleryIndex: undefined,
						galleryPosition: undefined,
						userName: undefined,
						favoritesIndex: index},
					{favoriteIndex: self.userSourceList.favoriteIndex}, 
					self.variablesToPublishList, false, true);
			});
			self.favorite_users = new UserArray();
			//self.log('debug',"Clear favorites");
		} else if (thisMsg.INTERNAL_ACTION == "addSelectionToFavorites") {
			self.favorite_users.push(
				...self.selected_users
				.filter(zoomID => self.favorite_users.indexOf(zoomID) === -1));
		}
		if (isNaN(selectedUser)) {
			self.log("debug", "Unable to favorite " + TARGET_TYPE + " " + userString + ": offline users cannot be used with favorites.");
		} else if (self.user_data[selectedUser] != undefined) {
			selectedUser = parseInt(selectedUser);
			switch(thisMsg.INTERNAL_ACTION){
				case "addFavorite":
					self.favorite_users.add(selectedUser); 
					break;
				case "removeFavorite":
					self.favorite_users.remove(selectedUser); 
					break;
				case "toggleFavorite":
					self.favorite_users.toggle(selectedUser); 
					break;
				default:
					break;
			}
			if (self.favorite_users.indexOf(selectedUser) == -1 && (thisMsg.INTERNAL_ACTION == "removeFavorite" || thisMsg.INTERNAL_ACTION == "toggleFavorite")) {
				self.setVariablesForUser(
					{	galleryIndex: undefined,
						galleryPosition: undefined,
						userName: undefined,
						favoritesIndex: self.favorite_users.length},
					{favoriteIndex: self.userSourceList.favoriteIndex}, 
					self.variablesToPublishList, false, true);
			}
		}
		self.update_user_variables_subset(self.variablesToPublishList, {favoriteIndex: self.userSourceList.favoriteIndex}, false);
		self.update_client_variables({
			numberOfFavoriteUsers: self.clientdatalabels.numberOfFavoriteUsers,
			favoriteUsersList: self.clientdatalabels.favoriteUsersList}, true);
		this.checkFeedbacks();
		return;
	}
}

};
////END ACTIONS

instance.prototype.userStatusProperties= [

	{id:'role',			   label:'User Role'},
	{id:'onlineStatus',	   label:'Online Status'},
	{id:'videoStatus',	   label:'Video Status'},
	{id:'audioStatus',	   label:'Audio Status'},
	{id:'spotlightStatus', label:'Spotlight Status'},
	{id:'activeSpeaker',   label:'Active Speaker Status'},
	{id:'handStatus',	   label:'Hand Raised Status'},
	{id:'selected',		   label:'Selected'},
	{id:'favorite',        label:'Favorite'},
	{id:'cameraDevice',    label:'Current Camera Device'},
	{id:'micDevice',       label:'Current Mic Device'},
	{id:'speakerDevice',   label:'Current Speaker Device'}

];

//Feedback defnitions
instance.prototype.init_feedbacks = function(){
	var self = this;
	let feedback_user_list = self.userList;
	//targeting feedbacks on the selection group is not supported
	delete feedback_user_list[ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_GROUP];
	delete feedback_user_list[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_GROUP];
	delete feedback_user_list[ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_GROUP];
	delete feedback_user_list[ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_GROUP];
	var feedbacks={};
		feedbacks.user_status_fb={
			type: 'boolean',
			label:'User Status Feedback',
			description:'Map user status to button properties',
			style:{
				bgcolor: self.rgb(0,0,0)
			},
			options:[
				{
					type:'dropdown',
					label:'User',
					id:'user',
					choices:feedback_user_list,
					default:feedback_user_list.me.id,
					minChoicesForSearch: 0
				},
				{
					type:'textinput',
					label:'User String',
					id:'userString',
					default:''
				},
				{
					type:'dropdown',
					label:'Property',
					id:'prop',
					choices:self.userStatusProperties,
					default:self.userStatusProperties[1].id,
					minChoicesForSearch: 0
				},
				{
					type:'dropdown',
					label:'Value',
					id:'propertyValue',
					choices:[{id:1,label:"On"},{id:0,label:"Off"}],
					default:1
				}
			],
			//handle feedback code
			callback: (feedback,bank)=>{

				if(!self.zoomosc_client_data.callStatus) return false;
				var opts=feedback.options;
				//only attempt the feedback if user and property exists
				if(opts.user!=undefined&& opts.prop!=undefined){
				var sourceUser;
				switch(opts.user){
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_GROUP:
						self.debug("Feedbacks targeting the selection group are not supported.");
						return; // not supported

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_INDEX:
						//switch to this so we spoof a zoomID message
						let this_index = parseInt(opts.userString);
						if (self.favorite_users.length > this_index) {
							sourceUser= parseInt(self.favorite_users[this_index]);
						}
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION_INDEX:
						sourceUser = self.selected_users.get(opts.userString);
						break;
			
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_FAVORITES_INDEX:
						sourceUser = self.favorite_users.get(opts.userString);
						break;
			
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SPOTLIGHT_INDEX:
						sourceUser = self.spotlit_users.get(opts.userString);
						break;
			
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_PIN1_INDEX:
						sourceUser = self.pin1_users.get(opts.userString);
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
					//look for user with target position in userstring
					for(let user in self.user_data){
						if(self.user_data[user].index==parseInt(opts.userString)){
							sourceUser=user;
							break;
						}
					}
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX:
					//look for user with gallery index in userstring
					for (let user in self.user_data){

						if(self.user_data[user].galleryIndex==parseInt(opts.userString)){
							sourceUser=user;
						break;
						}
					}
					break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION:
					//look for user with gallery position in userString
					for (let user in self.user_data){
						if(self.user_data[user].galleryPosition==opts.userString){
							sourceUser=user;
							break;
						}
					}
						break;

					case ZOSC.keywords.ZOSC_MSG_PART_ME:
					for (let user in self.user_data){
						if(self.user_data[user].me){
							sourceUser=user;
							break;
						}
					}
					//user me
						break;

					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
					//look for user with username in userstring
					for (let user in self.user_data){
						if(self.user_data[user].userName==opts.userString){
							sourceUser=user;
							break;
						}
					}
						break;
						//list index
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_LIST_INDEX:
						//look for user with specified index of user list
						var temp_users = Object.keys(self.user_data);
						var temp_index = parseInt(opts.userString);
						temp_index += self.zoomosc_client_data.listIndexOffset;

						if (temp_users.length > temp_index) {
							sourceUser = temp_users[temp_index];
						}
						//else { self.log('debug', 'Error in listIndex feedback, index: ' + temp_index + ', users length: ' + temp_users.length);}

						break;

					default:
					//user user selected in dropdown
					// console.log("USER NOT A TARGET type");
					// console.log(opts.user);

					for (let user in self.user_data){
						if(self.user_data[user].userName==opts.user){
							sourceUser=user;
							break;
						}
					}



						break;
				}
				//match property to value
				var userToFeedback=self.user_data[sourceUser];
				if(userToFeedback!=undefined){
				var propertyToFeedback=opts.prop;
				var userPropVal=userToFeedback[propertyToFeedback];
				//
					if (userPropVal==parseInt(opts.propertyValue)){
						return true;
					}
				}
			//check exists
			}
		//callback
		}
	//feedbacks
};
	//pass feedback definitions and check them
	this.setFeedbackDefinitions(feedbacks);
	this.checkFeedbacks();

};


//OSC Receive from Zoom OSC
instance.prototype.init_osc = function() {
	var self = this;

	self.ready = true;
	if (self.listener) {
		self.listener.close();
	}
if(!self.disabled){


	//Setup OSC Port
	self.listener = new OSC.UDPPort({
		localAddress: '0.0.0.0',
		localPort: self.config.feedbackPort,
		broadcast: true,
		metadata: true
	});

	//Start OSC listener and catch errors
	self.listener.open();
	self.listener.on("ready", function() {
		self.ready = true;
		// self.log('debug', 'listening');
	});
	self.listener.on("error", function(err) {
		if (err.code === "EADDRINUSE") {
			self.log('error', "Error: Selected port in use." + err.message);
		}
	});





////OSC LISTENER RECEIVE
	//check for zoom messages here
	self.listener.on("message", function(message) {
 
				//HELPERS
		function populateUserDevices(devMsgArgs,deviceType,){
			let userZoomID      = devMsgArgs[3].value;
			let devNumber       = devMsgArgs[4].value;
			let devID           = devMsgArgs[6].value;
			let devName         = devMsgArgs[7].value;
			let isCurrentDev 		= devMsgArgs[8].value;
			let devInfo         = {deviceId:devID,deviceName:devName,isCurrentDevice:isCurrentDev};
			let currentUser     = self.user_data[userZoomID];
			currentUser[deviceType][devNumber]=devInfo;
		}
		//pong message
		function parsePongRecvMsg(msgArgs){
			if (self.zoomosc_client_data.callStatus != msgArgs[4].value) self.init_variables(true, true);
			// self.log('debug', 'connected to zoom');
			self.zoomosc_client_data.last_ping					 =	Date.now();
			self.zoomosc_client_data.zoomOSCVersion			 =	msgArgs[1].value;
			self.zoomosc_client_data.subscribeMode			 =	msgArgs[2].value;
			self.zoomosc_client_data.galTrackMode				 =	msgArgs[3].value;
			self.zoomosc_client_data.callStatus					 =	msgArgs[4].value;
			self.zoomosc_client_data.numberOfTargets		 =	msgArgs[5].value;
			self.zoomosc_client_data.numberOfUsersInCall =	msgArgs[6].value;
			// self.checkFeedbacks('sub_bg');

			if (self.zoomosc_client_data.numberOfUsersInCall == 0 && Object.keys(self.user_data).length != 0) {
				self.system.emit('osc_send',
								self.config.host, self.config.port,
								'/zoom/list');
			}
		}

		//list message
		function parseListRecvMsg(msgArgs,isMe){

			// list messages are only sent when ZoomOSC is in a meeting
			self.zoomosc_client_data.callStatus = 1;
			self.zoomosc_client_data.last_list = Date.now();

			//add the values from the list to the user at index supplied

			var this_user = {
				index:						msgArgs[0].value,
				userName:				  msgArgs[1].value,
				galleryIndex:		  msgArgs[2].value,
				zoomID:					  msgArgs[3].value,
				//participantCount: msgArgs[4].value,
				//listCount:				msgArgs[5].value,
				role:						  msgArgs[6].value,
				get roleText() { return ['None','For Users','Always','Full'][this.role]; },
				onlineStatus:		  Boolean(msgArgs[7].value),
				videoStatus:			Boolean(msgArgs[8].value),
				audioStatus:			Boolean(msgArgs[9].value),

				get spotlightStatus() { return self.spotlit_users.includes(this.zoomID); },
				get pin1Status() { return self.pin1_users.includes(this.zoomID); },
				get pin2Status() { return self.pin2_users.includes(this.zoomID); },
				get selected() { return self.selected_users.includes(this.zoomID); },
				get favorite() { return self.favorite_users.includes(this.zoomID); },

				get favoritesIndex() { return (index = self.favorite_users.indexOf(this.zoomID)) >= 0 ? index : undefined; },
				get selectionIndex() { return (index = self.selected_users.indexOf(this.zoomID)) >= 0 ? index : undefined; },
				get spotlightIndex() { return (index = self.spotlit_users.indexOf(this.zoomID)) >= 0 ? index : undefined; },
				get pin1Index() { return (index = self.pin1_users.indexOf(this.zoomID)) >= 0 ? index : undefined; },
				get pin2Index() { return (index = self.pin2_users.indexOf(this.zoomID)) >= 0 ? index : undefined; },

				get activeSpeaker() { return self.zoomosc_client_data.activeSpeaker_zoomID == this.zoomID; },
				handStatus:			  false,
				cameraDevices:		[],
				micDevices:       [],
				speakerDevices:   [],
				backgrounds:      [],
				me: Boolean(isMe) ? true : null,
				get listIndex() {return (listIndex = Object.keys(self.user_data).indexOf(this.zoomID)) >= 0 ? self.zoomosc_client_data.listIndexOffset + listIndex : -1; }
			};
			/*var roleTextVals=[
				'None','For Users','Always','Full'
			];
			var onOffTextVals=['Off','On'];
			var onlineTextVals=['Offline','Online'];
			var handTextVals=['Down','Up'];
			var activeSpeakerTextVals=['Inactive','Active'];
			this_user.roleText						= roleTextVals[this_user.role];
			this_user.videoStatusText		  = onOffTextVals[this_user.videoStatus];
			this_user.audioStatusText		  = onOffTextVals[this_user.audioStatus];
			this_user.onlineStatusText		= onlineTextVals[this_user.onlineStatus];
			this_user.activeSpeakerText	  = activeSpeakerTextVals[this_user.activeSpeaker];
			this_user.handStatusText			= handTextVals[this_user.handStatus];
			this_user.spotlightStatusText = onOffTextVals[this_user.spotlightStatus];*/

			if (this_user.zoomID == -1) {
				this_user.zoomID = "offline_" + this_user.zoomID + "_" + this_user.index;
			}

			//if (this_user.onlineStatus>=0 && this_user.zoomID>=0) {
				//set variables and action properties from received list
				self.user_data[this_user.zoomID] = this_user;
				self.assign_user_gallery_position(this_user.zoomID, this_user.galleryIndex);
				self.setVariablesForUser(self.user_data[this_user.zoomID], self.userSourceList, self.variablesToPublishList);
			//}

			//msgArgs[5].value is the total count of all users in the zoomosc list
			/*if (msgArgs[5].value == Object.keys(self.user_data).length) { //true if this is the last expected list message
				//self.update_user_variables_subset(self.variablesToPublishList, [self.userSourceList.listIndex]);
				//self.export_variables();
				self.actions();
				self.status(self.STATUS_OK);
			}*/
		}

// console.log("Received OSC Message: "+ JSON.stringify(message));
//list messages for users/me
var recvMsg=message.address.toString().split('/');
var zoomPart=recvMsg[1];
var msgTypePart=recvMsg[2];
var usrMsgTypePart=recvMsg[3];
 // /zoomosc/galleryShape 1 2
//zoomosc message
if(zoomPart==ZOSC.keywords.ZOSC_MSG_PART_ZOOMOSC){
	//if valid osc received, reset ping counter
	self.zoomosc_client_data.last_ping					 =	Date.now();
	//target
	switch(msgTypePart){
		//Me
		case ZOSC.keywords.ZOSC_MSG_PART_ME:
		var isMe=true;
		/*falls through*/
		//User
		case ZOSC.keywords.ZOSC_MSG_PART_USER:
			// console.log("user/me MESSAGE RECEIVED");
			// Info: sending OSC message /zoomosc/me/videoOff -1 "squirrel" 1 16780288
			var usrMsgUser=message.args[3].value;
			var usrMsgUsername = message.args[1].value;
			//type of user message
			switch(usrMsgTypePart){
				//List Received
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_LIST.MESSAGE:
					console.log("LIST RECEIVED");
					//test user name for no user
					// let userNameToTest= message.args[1].value;
					let userZoomID=		 message.args[3].value;
					let userOnlineStatus= message.args[7].value;

					if(userOnlineStatus==0 && message.args[0].value == -1){ //remove offline users without a target ID
						self.debug("DELETE OFFLINE USER");
						
						self.remove_variables_for_user(userZoomID);
						delete self.user_data[userZoomID];
					}
					else{
						//My list msg is always sent first, so clear list if reciving my list
						//TODO: move this block to on recived msg 'listCleared' once implemented in ZoomOSC
						//if (isMe && self.currentStatus != self.STATUS_WARNING) {
							//console.log("LIST RECEIVED for me; resetting");
							//self.status(self.STATUS_WARNING, "Refreshing Participant List");
							//self.clear_user_data();
							//TODO: Remove asking for gallery order once it's sent with list messages
							/*self.system.emit('osc_send',
								self.config.host, self.config.port,
								'/zoom/getGalleryOrder');
							self.system.emit('osc_send',
								self.config.host, self.config.port,
								'/zoom/getOrder');
							*/
						//}
						parseListRecvMsg(message.args,isMe);
					}

					break;
				
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USERNAME_CHANGED.MESSAGE:
					console.log('Username changed for zoomID', usrMsgUser, 'from', message.args[4].value, 'to', message.args[1].value);
					self.user_data[usrMsgUser].userName = message.args[1].value;
					self.remove_variables_for_user(usrMsgUser, "user");
					self.setVariablesForUser(self.user_data[usrMsgUser], [self.userSourceList.userName], self.variablesToPublishList);
					self.setVariablesForUser(self.user_data[usrMsgUser], self.userSourceList, {userName: self.variablesToPublishList.userName});
					break;
				
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USER_ROLE_CHANGED.MESSAGE:
					console.log('Role changed for zoomID', usrMsgUser, 'from', self.user_data[usrMsgUser].role, 'to', message.args[4].value);
					self.user_data[usrMsgUser].role = message.args[4].value;
					self.update_client_variables({
						numberOfCohosts: self.clientdatalabels.numberOfCohosts,
						numberOfAttendees: self.clientdatalabels.numberOfAttendees,
						numberOfPanelists: self.clientdatalabels.numberOfPanelists}, true);
					break;

				//user status messages
				//pins
				/*case ZOSC.actions.PIN_GROUP.MESSAGES.ZOSC_MSG_PART_PIN.USER_ACTION:
					console.log('pin: '+self.user_data[usrMsgUser]);
					self.user_data[usrMsgUser].pinStatus=true;
					self.update_client_variables({numberOfPin1Users: self.clientdatalabels.numberOfPin1Users}, true);
					break;*/
				/*case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPOTLIGHT_ON.MESSAGE:
					if (self.spotlit_users.indexOf(usrMsgUser) === -1) {
						self.debug('Spotlight on for user ' + usrMsgUser + ' (' + usrMsgUsername + ')');
						//self.user_data[usrMsgUser].spotlightStatus=true;
						//self.user_data[usrMsgUser].spotlightStatusText='On';
						self.spotlit_users.push(usrMsgUser);
						self.update_client_variables({numberOfSpotlitUsers: self.clientdatalabels.numberOfSpotlitUsers}, true);
					} else self.debug('Spotlight **already** on for user ' + usrMsgUser + ' (' + usrMsgUsername + ')');
					break;*/
				/*case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPOTLIGHT_OFF.MESSAGE:
					if ((this_index = self.spotlit_users.indexOf(usrMsgUser)) !== -1) {
						self.debug('Spotlight off for user ' + usrMsgUser + ' (' + usrMsgUsername + ')');
						//self.user_data[usrMsgUser].spotlightStatus=false;
						//self.user_data[usrMsgUser].spotlightStatusText='Off';
						self.spotlit_users.splice(this_index, 1);
						self.update_client_variables({numberOfSpotlitUsers: self.clientdatalabels.numberOfSpotlitUsers}, true);
					} else self.debug('Spotlight **already** off for user ' + usrMsgUser + ' (' + usrMsgUsername + ')');
					break;*/
				//AV: VIDEO
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_VIDON.USER_ACTION:
					console.log('vidstatus on: '+self.user_data[usrMsgUser]);
					self.user_data[usrMsgUser].videoStatus=true;
					//self.user_data[usrMsgUser].videoStatusText='On';
					self.update_client_variables({numberOfVideoOn: self.clientdatalabels.numberOfVideoOn}, true);
					break;
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_VIDOFF.USER_ACTION:
					console.log("vidstatus OFF");
					self.user_data[usrMsgUser].videoStatus=false;
					//self.user_data[usrMsgUser].videoStatusText='Off';
					self.update_client_variables({numberOfVideoOn: self.clientdatalabels.numberOfVideoOn}, true);
					break;

				//AV: AUDIO
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_UNMUTE.USER_ACTION:
					console.log('UNMUTE: ');
					self.user_data[usrMsgUser].audioStatus=true;
					//self.user_data[usrMsgUser].audioStatusText='On';
					self.update_client_variables({numberOfUnmuted: self.clientdatalabels.numberOfUnmuted}, true);
					break;

				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_MUTE.USER_ACTION:
					console.log("MUTE");
					self.user_data[usrMsgUser].audioStatus=false;
					//self.user_data[usrMsgUser].audioStatusText='Off';
					self.update_client_variables({numberOfUnmuted: self.clientdatalabels.numberOfUnmuted}, true);
					break;

				//onlie status
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USER_ONLINE.MESSAGE:
					console.log("online");
					self.user_data[usrMsgUser].onlineStatus=true;
					//self.user_data[usrMsgUser].onlineStatusText='Online';
					break;

				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USER_OFFLINE.MESSAGE:
					console.log("offline");
					self.user_data[usrMsgUser].onlineStatus=false;
					//self.user_data[usrMsgUser].onlineStatusText='Offline';
					//only remove users with no target ID
					if (self.user_data[usrMsgUser].index == -1) self.remove_variables_for_user(usrMsgUser);
					break;
					//add camera devices to users
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_CAMERA_DEVICE_LIST.MESSAGE:
					console.log('Camera devices for: '+usrMsgUser+': '+JSON.stringify(message.args));
					// console.log(message.args)
					populateUserDevices(message.args,ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_CAMERA_DEVICE_LIST.MESSAGE);
					// console.log("USERS: "+JSON.stringify(self.user_data));
					break;
				//WIP current camera device
				// case ZOSC.outputLastPartMessages.ZOSC_MSG_PART_CAMERA_DEVICE.MESSAGE:
				// 	console.log('current camera device for: '+usrMsgUser+': '+JSON.stringify(message.args));
				// 	let devType=ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_CAMERA_DEVICE_LIST.MESSAGE;
				// 	setCurrentDev(message.args,devType);
				// 	function setCurrentDev(msgArgs,deviceType){
				// 		let currentDevID  =  msgArgs[4];
				// 		let currentUserID =  msgArgs[3];
				// 		let userDevices = self.user_data[currentUserID][deviceType];
				// 		for (let device in userDevices){
				// 			if (userDevices[device].devID=currentDevID){
				// 				userDevices[device].isCurrentDevice=1;
				// 			}else{
				// 				userDevices[device].isCurrentDevice=0;
				// 			}
				// 		}
				//
				// 	}
				// break;
				//add mic devices to users

				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_MIC_DEVICE_LIST.MESSAGE:
					console.log('Mic devices for: '+usrMsgUser);
					populateUserDevices(message.args,ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_MIC_DEVICE_LIST.MESSAGE);
					// console.log("USERS: "+JSON.stringify(self.user_data));
					break;
					//add speaker devices to users
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPEAKER_DEVICE_LIST.MESSAGE:
					console.log('Speaker devices for: '+usrMsgUser);
					populateUserDevices(message.args,ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPEAKER_DEVICE_LIST.MESSAGE);

					// console.log("USERS: "+JSON.stringify(self.user_data));
					break;
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_BACKGROUND_LIST.MESSAGE:
					console.log('backgrounds for: '+usrMsgUser);
					populateUserDevices(message.args,ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_BACKGROUND_LIST.MESSAGE);

					// console.log("USERS: "+JSON.stringify(self.user_data));
					break;

				//Active speaker/spotlight
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_ACTIVE_SPEAKER.MESSAGE:
					console.log("active speaker");
					var speakerZoomID=message.args[3].value;
					self.zoomosc_client_data.activeSpeaker=message.args[1].value; //username
					self.zoomosc_client_data.activeSpeaker_zoomID=message.args[3].value; //zoomID
					self.update_client_variables({activeSpeaker: self.clientdatalabels.activeSpeaker}, true);
					break;

					//Hand Raising
					case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_HAND_RAISED.MESSAGE:
						console.log("Hand Raised");
						self.user_data[usrMsgUser].handStatus=true;
						//self.user_data[usrMsgUser].handStatusText='Up';
						self.update_client_variables({numberOfRaisedHands: self.clientdatalabels.numberOfRaisedHands}, true);
						break;

					case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_HAND_LOWERED.MESSAGE:
						console.log("hand lowered");
						self.user_data[usrMsgUser].handStatus=false;
						//self.user_data[usrMsgUser].handStatusText='Down';
						self.update_client_variables({numberOfRaisedHands: self.clientdatalabels.numberOfRaisedHands}, true);
						break;

				default:
					self.debug("user message not matched: " + JSON.stringify(recvMsg) + " " + JSON.stringify(message.args));
					break;
		}

		if (isMe) {
			self.setVariablesForUser(self.user_data[usrMsgUser], [self.userSourceList.me], self.variablesToPublishList);
		}
			break;
		//pong message received
		case 'pong':
			parsePongRecvMsg(message.args);
			self.update_client_variables();
			//self.debug("Pong received");
			break;
		case 'gallerySize' :
		case 'galleryShape':
			self.zoomosc_client_data.galleryShape[0]=message.args[0].value;
			self.zoomosc_client_data.galleryShape[1]=message.args[1].value;
			console.log("Gallery shape message received: "+self.zoomosc_client_data.galleryShape);
			break;

		case 'galleryCount':
			self.zoomosc_client_data.galleryCount = message.args[0].value;
			console.log("gallery count message received: "+self.zoomosc_client_data.galleryCount);
			break;

		case 'galleryOrder':
			if (!self.zoomosc_client_data.callStatus) break;  // avoid setting gallery if not in meeting
			console.log("Gallery Order Message Received: "+JSON.stringify(message));
			//add order to client data
			self.zoomosc_client_data.galleryOrder=[];
			for(let user in message.args){
				self.zoomosc_client_data.galleryOrder.push(message.args[user].value);
			}
			//delete offline users
			self.remove_offline_users();
			// clear existing gallery indexes
			Object.keys(self.user_data).forEach(zoomID => { self.user_data[zoomID].galleryIndex= -1; });
			//console.log(self.user_data[zoomID].userName, ", ", self.user_data[zoomID].galleryIndex, ", ", self.user_data[zoomID].galleryPosition);
			
			//assign gallery index to users in self.user_data
			//console.log("gallery order: " + self.zoomosc_client_data.galleryOrder);
			/*let galleryOrder=self.zoomosc_client_data.galleryOrder;
			for( i=0; i<galleryOrder.length; i++ ){
				let currentZoomID=galleryOrder[i];
				if (currentZoomID in self.user_data) {
					self.user_data[currentZoomID].galleryIndex=i;
					console.log("user: "+self.user_data[currentZoomID].userName+" galindex: "+self.user_data[currentZoomID].galleryIndex);
				} else {
					console.log("zoomID", currentZoomID, "not found in self.user_data");
				}
			}*/
			//console.log("Users not in gallery: ", Object.keys(self.user_data).filter(zoomID => !self.zoomosc_client_data.galleryOrder.includes(Number(zoomID))));
			//assign galleryPositions based on new galleryIndexes
			Object.keys(self.user_data).forEach(zoomID => self.clear_user_gallery_position(zoomID));
			Object.keys(self.user_data).forEach(zoomID => self.assign_user_gallery_position(zoomID));
			//refresh variables from galleryIndex and galleryPosition
			/*self.update_user_variables_subset(
				self.variablesToPublishList, 
				[self.userSourceList.galleryIndex,
				 self.userSourceList.galleryPosition]);*/
			self.export_variables();

			// console.log("Gallery Order Message Received: "+JSON.stringify(self.zoomosc_client_data.galleryOrder));
			break;

		case 'listCleared': //ZOSC.outputFullMessages.ZOSC_MSG_SEND_LIST_CLEAR.MESSAGE:
			console.log('List Cleared message received');
			if (self.zoomosc_client_data.callStatus) self.status(self.STATUS_WARNING, "Refreshing Participant List");
			self.clear_user_data();
			break;

		case 'pin1Order':
			self.pin1_users=new UserArray();
			for(let user in message.args){
				self.pin1_users.push(message.args[user].value);
			}
			self.update_client_variables({numberOfPin1Users: self.clientdatalabels.numberOfPin1Users}, true);
			self.update_user_variables_subset(self.variablesToPublishList, [self.userSourceList.pin1Index]);
			break;

		case 'pin2Order':
			self.pin2_users=new UserArray();
			for(let user in message.args){
				self.pin2_users.push(message.args[user].value);
			}
			self.update_user_variables_subset(self.variablesToPublishList, [self.userSourceList.pin2Index]);
			break;

		case 'spotlightOrder':
			self.spotlit_users=new UserArray();
			for(let user in message.args){
				self.spotlit_users.push(message.args[user].value);
			}
			self.update_user_variables_subset(self.variablesToPublishList, [self.userSourceList.spotlightIndex]);
			self.update_client_variables({numberOfSpotlitUsers: self.clientdatalabels.numberOfSpotlitUsers}, true);
			break;

		default:
			self.debug("zoom message not matched: " + JSON.stringify(recvMsg) + " " + JSON.stringify(message.args));
			break;

	}
/*
console.log(message.address.toString());
	//match outputFullMessages
	switch(message.address.toString()){

			case ZOSC.outputFullMessages.ZOSC_MSG_SEND_LIST_CLEAR.MESSAGE:
			 console.log("clearing list");
			 //moved to clearing data when reciving first message of list (/zoomosc/me/list)
			 //self.clear_user_data();
			 break;

		 default:
			 break;
	}*/
		//self.init_variables();
		//console.log('Checking feedbacks');
		self.checkFeedbacks();
}


});

}


};



// PING
instance.prototype.init_ping = function() {
	var self = this;
	function pingOSC(){
		self.system.emit('osc_send', self.config.host, self.config.port, ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_PING.MESSAGE);
		if(self.zoomosc_client_data.subscribeMode<1){
			//set subscribe mode
			self.system.emit('osc_send',
				self.config.host,				self.config.port,
				ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_SUBSCRIBE.MESSAGE, {type: 'f', value: parseFloat(self.config.subscribeMode)}
			);
			//set participant reporting mode
			self.system.emit('osc_send',
				self.config.host,				self.config.port,
				ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE, {type: 'f', value: parseFloat(self.config.participantReportingMode)}
			);

		}
	}

	//if zoomosc not found, ping every second, otherwise check if ping needs to be sent

	setTimeout(function ping() {
		if (self.disabled==true) {
			self.status(self.STATUS_UNKNOWN,'Disabled');
				}
				else{
		// self.getAllFeedbacks();
		var timesinceping = Date.now() - self.zoomosc_client_data.last_ping;
		var timesincelist = Date.now() - self.zoomosc_client_data.last_list;
		//has ping been sent?
		if (self.zoomosc_client_data.last_ping > 0) {
			//Send ping if last ping sent too long ago
			if (timesinceping > PING_TIMEOUT) {
			pingOSC();
			}
		}
		//Send if ping never sent
		else {
			pingOSC();
		}
		//Set Status to Error in config if ping not responded to
		if (timesinceping > PING_TIME_ERR && self.currentStatus != self.STATUS_ERROR) {
			self.zoomosc_client_data.state = 'offline';
			self.zoomosc_client_data.zoomOSCVersion			=	"Not Connected";
			self.zoomosc_client_data.subscribeMode			 =	0;
			self.zoomosc_client_data.galTrackMode				=	0;
			self.zoomosc_client_data.callStatus					=	0;
			self.zoomosc_client_data.numberOfTargets		 =	0;
			self.zoomosc_client_data.numberOfUsersInCall =	0;
			self.zoomosc_client_data.activeSpeaker = "None";
			self.zoomosc_client_data.activeSpeaker_zoomID = -1;
			self.spotlit_users = new UserArray();
			self.pin1_users = new UserArray();
			self.pin2_users = new UserArray();
			self.selected_users = new UserArray();
			self.favorite_users = new UserArray();
			self.status(self.STATUS_ERROR, "Not Connected");
			self.clear_user_data();
			self.debug("No connection with ZoomOSC");
		}

		//Set status to OK if ping is responded within limit
		else if (timesinceping <= PING_TIME_ERR && self.currentStatus != self.STATUS_WARNING) {
			self.zoomosc_client_data.state = 'online';
			//if module was offline, initalize subscribe & galTrack modes and get list
			if (self.currentStatus == self.STATUS_ERROR) {
				//self.system.emit('osc_send', self.config.host, self.config.port, '/zoom/list');
				self.init_send_subscribe();
				self.debug("Successfully connected with ZoomOSC");
			}
			self.status(self.STATUS_OK);
			
		}

		if (self.zoomosc_client_data.last_list != -1 && timesincelist > LIST_TIMEOUT) {
			//finish parsing list output
			self.update_client_variables();
			self.export_variables();
			self.actions();
			self.status(self.STATUS_OK);
			self.zoomosc_client_data.last_list = -1;
			self.debug("Finished parsing list messages");
		}
	}

	//Ping timeout loop. cleared when instance disabled
	self.pingLoop = setTimeout(ping, PING_TIMEOUT);
	}, PING_TIMEOUT);
};

//PRESETS
instance.prototype.init_presets = function () {
	const fs = require('fs');
	const path = require('path');
	var self = this;
	var presets = [];

	var preset_actions = {
		"Audio": {
			preset_label: "Audio",
			button_label: "\\nAudio",
			action: 'AV_GROUP',
			message: 'ZOSC_MSG_PART_TOGGLE_MUTE',
			prop:'audioStatus',
			enabled_icon: ZOSC_ICONS.MIC_ENABLED,
			disabled_icon: ZOSC_ICONS.MIC_DISABLED
			},
		"Video": {
			preset_label: "Video",
			button_label: "\\nVideo",
			action: 'AV_GROUP',
			message: 'ZOSC_MSG_PART_TOGGLE_VIDEO',
			prop:'videoStatus',
			enabled_icon: ZOSC_ICONS.CAMERA_ENABLED,
			disabled_icon: ZOSC_ICONS.CAMERA_DISABLED
			},
		"Spotlight": {
			preset_label: "Spotlight",
			button_label: "\\nSpotlight",
			action: 'SPOTLIGHT_GROUP',
			message: 'ZOSC_MSG_PART_TOGGLE_SPOT',
			prop:'spotlightStatus',
			enabled_icon: ZOSC_ICONS.SPOTLIGHT_ENABLED,
			disabled_icon: ZOSC_ICONS.SPOTLIGHT_DISABLED
			},
		"Pin": {
			preset_label: "Pin",
			button_label: "\\nPin",
			action: 'PIN_GROUP',
			message: 'ZOSC_MSG_PART_TOGGLE_PIN',
			prop:'videoStatus', //TODO: change to pinStatus when implemented
			enabled_icon: ZOSC_ICONS.PIN_ENABLED,
			disabled_icon: null
			},
		"Single Selection": {
			preset_label: "Single Selection",
			button_label: "",
			action: 'SELECTION_GROUP',
			message: 'ZOSC_MSG_PART_LIST_SINGLE_SELECTION',
			prop:'selected',
			enabled_icon: null,
			disabled_icon: null
			},
		"Multiple Selection": {
			preset_label: "Multi-selection",
			button_label: "",
			action: 'SELECTION_GROUP',
			message: 'ZOSC_MSG_PART_LIST_TOGGLE_SELECTION',
			prop:'selected',
			enabled_icon: null,
			disabled_icon: null
			},
		"Select Favorites": {
			preset_label: "Select Favorites",
			button_label: "\\nFavorite",
			action: 'FAVORITES_GROUP',
			message: 'ZOSC_MSG_PART_TOGGLE_FAVORITE',
			prop:'favorite',
			enabled_icon: ZOSC_ICONS.FAVORITE_ENABLED,
			disabled_icon: ZOSC_ICONS.FAVORITE_DISABLED
			},
		"ZoomISO Output": {
			preset_label: "ZoomISO Outputs",
			button_label: "",
			action: 'ISO_ACTION_GROUP',
			message: 'ZOSC_MSG_OUTPUT_ISO',
			prop:'videoStatus', //TODO: change to isoStatus when implemented
			enabled_icon: null,
			disabled_icon: null
			},
		};

	var preset_target_types = {
			"GalleryPosition" : {
				preset_label: "Gallery Position (macOS only)",
				getButtonNumber: function (x, y) {return x+","+y;},
				row_count: 7, column_count: 7,
				var_string: "galPos",
				user_string: "galleryPosition"
			},
			"GalleryIndex" : {
				preset_label: "Gallery Index",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 7, column_count: 7,
				var_string: "galInd",
				user_string: "galIndex"
			},
			"ListIndex" : {
				preset_label: "List Index",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 7, column_count: 7,
				var_string: "listIndex",
				user_string: "listIndex"
			},
			"TargetID" : {
				preset_label: "Target ID",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 7, column_count: 7,
				var_string: "tgtID",
				user_string: "targetID"
			},
			"FavoritesIndex" : {
				preset_label: "Favorites Index",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 7, column_count: 7,
				var_string: "favoritesIndex",
				user_string: "favoritesIndex"
			},
			"SelectionIndex" : {
				preset_label: "Selection Index",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 7, column_count: 7,
				var_string: "selectionIndex",
				user_string: "selectionIndex"
			},
			"SpotlightIndex" : {
				preset_label: "Spotlight Index",
				getButtonNumber: function (x, y) {return (x*7)+y;},
				row_count: 9, column_count: 1,
				var_string: "spotlightIndex",
				user_string: "spotlightIndex"
			},
			"Pin1Index" : {
				preset_label: "Pin Screen 1 Index",
				getButtonNumber: function (x, y) {return x+y;},
				row_count: 9, column_count: 1,
				var_string: "pin1Index",
				user_string: "pin1Index"
			},
		};
	
		var remove_instance_identifiers = function (obj) {
			return obj.reduce((acc, value) => acc.concat(Object.keys(value).filter(
				a => !["id", "label", "instance", "instance_id"].includes(a)).reduce(
					(obj, key) => {
						obj[key] = value[key];
						return obj;
					}, {})), []);
		};

for(const [targetType_short, targetType] of Object.entries(preset_target_types)) {
	for(const [preset_action_short, preset_action] of Object.entries(preset_actions)) {
		for(let x=0;x<targetType.column_count;x++){
			for(let y=0;y<targetType.row_count;y++){
				presets.push({
					category: preset_action.preset_label+" by "+targetType.preset_label,
					label: preset_action.preset_label+" by "+targetType.preset_label+" ("+targetType.getButtonNumber(x,y)+")",
					bank: {
						style: 'text',
						text: '$('+self.config.label+':userName_'+targetType.var_string+'_'+
							  targetType.getButtonNumber(x,y)+')'+preset_action.button_label,
						size: 'Auto',
						color: self.rgb(255,255,255),
						bgcolor: self.rgb(0,0,0)
					},
					actions: [{
						action: preset_action.action,
						options: {
							message: preset_action.message,
							user: targetType.user_string,
							userString:targetType.getButtonNumber(x,y)
						}
					}],
					feedbacks:[{
						type:'user_status_fb',
						options:{
							user:targetType.user_string,
							userString:targetType.getButtonNumber(x,y),
							prop:preset_action.prop,
							propertyValue:1,
						},
						style:{
							bgcolor: self.rgb(0,100,0)
						}

					},
					{
						type:'user_status_fb',
						options:{
							user:targetType.user_string,
							userString:targetType.getButtonNumber(x,y),
							prop:preset_action.prop,
							propertyValue:0,
						},
						style:{
							bgcolor:self.rgb(100,0,0)
						}

					}
				]
				});

			}
		}

		var local_path_options = [
			targetType_short+" "+preset_action_short,
			'* '+preset_action_short,
			targetType_short+' *', '*'];

		for (let local_path of local_path_options) {
			if (fs.existsSync(local_path = path.resolve(__dirname,'presets/'+local_path+'.companionconfig'))) {
				let local_preset = JSON.parse(fs.readFileSync(local_path));
				for(const [config_key, config_value] of (Object.entries(local_preset.config).filter(e => Object.keys(e[1]).length !== 0))) {
					//config_value.text = config_value.text.replaceAll("$(zoomosc", "$("+self.config.label);
					presets.push({
						category: preset_action.preset_label+" by "+targetType.preset_label,
						label: config_value.text,
						bank: config_value,
						actions: remove_instance_identifiers(local_preset.actions[config_key]),
						release_actions: remove_instance_identifiers(local_preset.release_actions[config_key]),
						feedbacks: remove_instance_identifiers(local_preset.feedbacks[config_key]),
					});
				}
			}
		}
	}
}
console.log("DEBUG Finding custom presets", fs.readdirSync(path.resolve(__dirname,'presets/')));
fs.readdirSync(path.resolve(__dirname,'presets/')).forEach(file => {
	if(path.basename(file).startsWith("Custom")) {
		let local_preset = JSON.parse(fs.readFileSync(path.resolve(__dirname,'presets/'+file)));
		for(const [config_key, config_value] of (Object.entries(local_preset.config).filter(e => Object.keys(e[1]).length !== 0))) {
			//config_value.text = config_value.text.replaceAll("$(zoomosc", "$("+self.config.label);
			presets.push({
				category: local_preset.page.name,
				label: config_value.text,
				bank: config_value,
				actions: remove_instance_identifiers(local_preset.actions[config_key]),
				release_actions: remove_instance_identifiers(local_preset.release_actions[config_key]),
				feedbacks: remove_instance_identifiers(local_preset.feedbacks[config_key]),
			});
		}
	}
});


self.setPresetDefinitions(presets);
};
//Add module to companion
instance_skel.extendedBy(instance);
exports = module.exports = instance;
