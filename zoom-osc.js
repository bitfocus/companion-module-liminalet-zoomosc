//Liminal ZoomOSC Plugin for BitFocus Companion
var instance_skel = require('../../instance_skel');
var OSC 					= require('osc');
//API file
var ZOSC=require('./zoscconstants');

var debug;
var log;

const PING_TIME_ERR = 6000;
const PING_TIMEOUT	= 1000;
//default network settings
const DEF_TX_PORT	 = '9090';
const DEF_TX_IP		 = '127.0.0.1';
const DEF_RX_PORT	 = '1234';

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
	self.zoomosc_client_data.subscribeMode			 = 0;
	self.zoomosc_client_data.galleryShape				= [0,0];
	self.zoomosc_client_data.oldgalleryShape		 = [0,0];
	self.zoomosc_client_data.activeSpeaker			 = "None";
	self.zoomosc_client_data.zoomOSCVersion			= "Not Connected";
	self.zoomosc_client_data.subscribeMode			 =	0;
	self.zoomosc_client_data.galTrackMode				=	0;
	self.zoomosc_client_data.callStatus					=	0;
	self.zoomosc_client_data.numberOfTargets		 =	0;
	self.zoomosc_client_data.numberOfUsersInCall =	0;


	self.disabled=false;
	self.pingLoop={ };
	// super-constructor
	instance_skel.apply(this, arguments);
	Object.assign(this, {
		...feedbacks
	});
	self.actions(); // export actions
	self.init_presets();
	self.addUpgradeScript(function() {
		if (self.config.host !== undefined) {
			self.config.old_host = self.config.host;
		}
	});

//Subscribe to ZoomOSC
	self.system.emit('osc_send',
		self.config.host,				self.config.port,
		ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_SUBSCRIBE.MESSAGE,
		 {type: 'f', value: parseFloat(self.config.subscribeMode)}
	);
	//set gallery track mode
	self.system.emit('osc_send',
		self.config.host,				self.config.port,
		ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE,
		{type: 'i', value: parseInt(self.config.galTrackMode)}
	);

	return self;
}

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
		//set gallery track mode
		self.system.emit('osc_send',
			self.config.host,				self.config.port,
			ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE,
			{type: 'i', value: parseInt(self.config.galTrackMode)}
		);
};


instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	this.disabled=false;
	self.init_osc();
	self.status(self.STATE_OK);
	self.init_variables();
	self.init_ping();
	self.init_feedbacks();
	self.init_presets();

};

//Add Variables. Called after every received msg from zoomosc
instance.prototype.init_variables = function() {

	var self = this;
	var variables= null;
	variables = [];
	//print list of users
	// console.log("USERS: "+JSON.stringify(self.user_data));
	// self.log('debug',"USERS: "+JSON.stringify(self.user_data));

	var userSourceList=[
		{varName:'userName',						varString:'user',							varLabel:''},
		{varName:'index',							 varString:'tgtID',						 varLabel:'Target ID'},
		{varName:'galleryIndex',				varString:'galInd',						varLabel:'Gallery Index'},
		{varName:'galleryPosition',		 varString:'galPos',						varLabel:'Gallery Position'}
	];
	//variable name in user data, string to tag companion variable
	var variablesToPublishList=[
		{varName:'userName',						varString:'userName',					varLabel:"User Name"},
		{varName:'galleryIndex',				varString:'galIndex',					varLabel:'Gallery Index'},
		{varName:'roleText',						varString:'role',							varLabel:'Role'},
		{varName:'onlineStatusText',		varString:'onlineStatus',			varLabel:'Online Status'},
		{varName:'videoStatusText',		 varString:'videoStatus',			 varLabel:'Video Status'},
		{varName:'audioStatusText',		 varString:'audioStatus',			 varLabel:'Audio Status'},
		{varName:'spotlightStatusText', varString:'spotlightStatus',	 varLabel:'Spotlight Status'},
		{varName:'handStatusText',			varString:'handStatus',				varLabel:'Hand Status'},
		{varName:'activeSpeakerText',	 varString:'activeSpeaker',		 varLabel:'Active Speaker'},
		{varName:'selected',		 varString:'selected',						varLabel:'Selected'}
	];

function setVariablesForUser(sourceUser,userSourceList,variablesToPublishList){
	//user name in user data, string to tag companion variable

//variables
for(var variableToPublish in variablesToPublishList){
	// sources
	for(var source in userSourceList){
		var thisSource=userSourceList[source];
		//dont publish variables that are -1
		if(sourceUser[thisSource.varName]!=-1){
			var thisVariable=variablesToPublishList[variableToPublish];
			var thisVariableName=thisVariable.varName;

			var thisFormattedVarLabel=thisVariable.varLabel+' for '+thisSource.varLabel+' '+sourceUser[thisSource.varName];
			var thisFormattedVarName=thisVariable.varString+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName];

			//clear all variables to '-' if not in a call
			var thisVariableValue;
			if(!self.zoomosc_client_data.callStatus){
				thisVariableValue='-';
			}else{
				thisVariableValue=sourceUser[thisVariableName];
			}

					variables.push({
						label:thisFormattedVarLabel,
						name: thisFormattedVarName
					});
					self.setVariable( thisFormattedVarName, thisVariableValue);
				}
			else{
				// console.log("Variable not set");
			}
		}
	}
}


// GRID LAYOUT/calculate gallery position data
	var numRows=self.zoomosc_client_data.galleryShape[0];
	var numCols=self.zoomosc_client_data.galleryShape[1];

	var userIndex=0;
for(y=0;y<ZOOM_MAX_GALLERY_SIZE_Y;y++){
			for (x=0;x<ZOOM_MAX_GALLERY_SIZE_X;x++){
				// check which user is in gallery position
			for (let user in self.user_data){
					if(self.user_data[user].zoomID==self.zoomosc_client_data.galleryOrder[userIndex]){
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
						for (i=0;i<variablesToPublishList.length;i++){
							let thisFormattedVarName=variablesToPublishList[i].varString+'_galPos_'+y+','+x;
							// thisVariable.varString+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName]
							self.setVariable( thisFormattedVarName,'-');
						}
				}
		}
	}

self.zoomosc_client_data.oldgalleryShape = Object.assign({}, self.zoomosc_client_data.galleryShape);

	//add new variables from list of users
	if(Object.keys(self.user_data).length>0){
		for (let user in self.user_data) {
			var this_user = self.user_data[user];

			setVariablesForUser(this_user,userSourceList,variablesToPublishList);

		}
}

//Client variables
var clientdatalabels = {
zoomOSCVersion:'ZoomOSC Version',
subscribeMode:'Subscribe Mode',
galTrackMode:'Gallery Tracking Mode',
callStatus :'Call Status',
numberOfTargets:'Number of Targets',
numberOfUsersInCall: 'Number of Users in Call',
activeSpeaker:'Active Speaker'
};
var clientVarVal=0;
//
for(let clientVar in clientdatalabels){
	//ZoomOSC Version
	switch(clientVar){
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

			case 'galTrackMode':
				switch(self.zoomosc_client_data[clientVar]){

					case ZOSC.enums.GalleryTrackModeTargetIndex:
						clientVarVal='Target Index';
						break;

					case ZOSC.enums.GalleryTrackModeZoomID:
						clientVarVal='ZoomID';
						break;

					default:
						break;
					}
				break;

			default:
				break;

	}

		variables.push({
			label: clientdatalabels[clientVar],
			name:	'client_'+clientVar
		});

	self.setVariable('client_'+clientVar,clientVarVal);
	}

self.setVariableDefinitions(variables);
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
			id:	 'galTrackMode',
			label: 'Gallery Tracking Mode ---ZOOMID MODE REQUIRED FOR GALLERY TRACKING FEATURES---',
			choices:[
				{id: ZOSC.enums.GalleryTrackModeTargetIndex, label: 'Target Index'},
				{id: ZOSC.enums.GalleryTrackModeZoomID,			label: 'ZoomID'			}

			],
			default: ZOSC.enums.GalleryTrackModeZoomID
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
						 [ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION]:{
							id:ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION,
							 label:'--Selection--'
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
		if(userActionGroup=='APP_ACTION_GROUP'){
			newGroup={
				id:		 thisGroup.TITLE,
				label:	thisGroup.TITLE,
				options:[
					{
						type:'dropdown',
						label:'Message',
						id:'message',
						choices:groupActions,
						default:groupActions[0].id
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
							default:groupActions[0].id
						},
						{
							type:'dropdown',
							label:'User',
							id:'user',
							choices:this.userList,
							default:'me'
						},
						{
							type:'textinput',
							label:'User String',
							id:'userString'
						}
					]
				};
			}

			// split arguments
		var argStr = thisGroup.ARGS;
		var argsRaw = argStr.split(',');
		var args = [];
		argsRaw.forEach(element => {
			// console.log("arg is " + element)
			var parts = element.split(':');
			var types = parts[0].split('|');
			args.push({types: types, name: parts[1]});
		});
		//add arguments
		for (let arg in args) {
			switch(args[arg].types.toString()){
				case 'string':
				newGroup.options.push({
					type: 'textinput',
					label: args[arg].name,
					id: args[arg].name
				});
				break;

				case 'int':
				newGroup.options.push({
					type: 'number',
					label: args[arg].name,
					id: args[arg].name,
					min:0,
					max:1000,
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

				default:
					break;
			}
		}
				 //add action to action list
	allInstanceActions[userActionGroup]=newGroup;

	}
//set actions in ui
	self.system.emit('instance_actions', self.id,allInstanceActions);

};

////ACTIONS
instance.prototype.action = function(action) {
	var self = this;
	var args = [];
	var path = null;

	//set target type
	var TARGET_TYPE=null;
	var userString=null;
	console.log("SWITCH: "+action.options);
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
		
		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION:
				action.options.user=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
				var stringSelection = [];
				for (let user in self.user_data){
					if(self.user_data[user].selected){
						stringSelection.push(user);
					}
				}
				if (stringSelection.length > 1) {  // multiple users selected
					TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_GROUP_PART_USERS+'/'+ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;	
					userString = stringSelection.join(" ");
				} else {  // single user
					TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;	
					userString = parseInt(stringSelection[0])
				}
				self.log('info', "user selection ("+stringSelection.length + "): " + userString);
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET;
				userString=parseInt(action.options.userString);
				console.log("TARGET: "+userString+ typeof userString);
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME;
				userString=action.options.userString;
				break;

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION:
				TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION;
				userString=action.options.userString;
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
	for (let arg in action.options){
		console.log("ARG: "+arg);

		console.log("ARG: "+JSON.stringify(action.options));
		if(arg!='message'&&arg!='user'&&arg!='userString'&&action.options[arg].length>0){
			console.log("IS ARG: "+arg);
			var thisArg=action.options[arg];
			if(!isNaN(thisArg)){
			thisArg=parseInt(thisArg);
			}
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

//handle user actions
if('USER_ACTION' in thisMsg && action.user!=ZOSC.keywords.ZOSC_MSG_PART_ME ){
	path=	'/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/'+TARGET_TYPE+'/'+thisMsg.USER_ACTION;
		//make user
	if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX||TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET||ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID){
		args.push({type:'i',value:parseInt(userString)});
	}
	else if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_PART_ME){

	} else if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_GROUP_PART_USERS+'/'+ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID) {
		args.push({type:'i',value:parseInt(userString)});
	}
	else{
		args.push({type:'s',value:userString});
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
		if('MESSAGE' in thisMsg){
			path = thisMsg.MESSAGE;
		}
		else if ('GENERAL_ACTION' in thisMsg){
			path = '/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/'+thisMsg.GENERAL_ACTION;
		}

//if there are no args to be sent just send the path
	if(thisMsg.ARG_COUNT<1){
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
	else if('INTERNAL_ACTION' in thisMsg){
		self.log('info', "ZOSC Internal Action " + thisMsg.INTERNAL_ACTION)
		selectedUser=null
		if(thisMsg.INTERNAL_ACTION!="clearSelection") {
			for(let user in self.user_data){
				//if(!(this_user.zoomID in self.user_data)) {}
				switch (TARGET_TYPE){
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
					//look for user with target position in userstring
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
					case ZOSC.enums.ZOSC_MSG_PART_ME:
						for (let user in self.user_data){
							if(self.user_data[user].me){
								selectedUser = user
								break;
							}
						}
						break;
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
					//look for user with username in userstring
					for (let user in self.user_data){
						if(self.user_data[user].userName==userString){
							sourceUser=user;
							break;
						}
					}
						break;

					default:
						break;
				}
		}
	}

		switch(thisMsg.INTERNAL_ACTION){
			case "addSelection":
				self.user_data[selectedUser].selected = true;
				self.log('info', "Add selection to " + self.user_data[selectedUser].userName)
				break;
			case "removeSelection":
				self.user_data[selectedUser].selected = false;
				self.log('info',"Remove selection from " + self.user_data[selectedUser].userName)
				break;
			case "toggleSelection":
				self.user_data[selectedUser].selected = !(self.user_data[selectedUser].selected);
				self.log('info',"Toggle selection " + self.user_data[selectedUser].userName)
				break;
			case "clearSelection":
				for (let user in self.user_data){
					self.user_data[user].selected = false;
				}
				self.log('info',"Clear selection")
				break;
			default:
				break;
		}

		var stringSelection = [];
		for (let user in self.user_data){
			if(self.user_data[user].selected){
				stringSelection.push(user);
			}
		}
		userString = stringSelection.join(" ");
		self.log('info', "target selection" + userString);
	}

};
////END ACTIONS

//Feedback defnitions
instance.prototype.init_feedbacks = function(){
	var self = this;
	var userStatusProperties= [

			{id:'role',					label:'User Role'},
			{id:'onlineStatus',	label:'Online Status'},
			{id:'videoStatus',	 label:'Video Status'},
			{id:'audioStatus',	 label:'Audio Status'},
			{id:'activeSpeaker', label:'Active Speaker Status'},
			{id:'handStatus',		label:'Hand Raised Status'},
			{id:'selectionStatus',		label:'Selected'}

	];

	var feedbacks={};
		feedbacks.user_status_fb={
			label:'User Status Feedback',
			description:'Map user status to button properties',
			options:[
				{
					type:'dropdown',
					label:'User',
					id:'user',
					choices:this.userList,
					default:'Me'
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
					choices:userStatusProperties

				},
				{
					type:'dropdown',
					label:'Value',
					id:'propertyValue',
					choices:[{id:1,label:"On"},{id:0,label:"Off"}],
					default:1
				},
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(255,255,255)
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(0,0,0)
				}
			],
			//handle feedback code
			callback: (feedback,bank)=>{

				var opts=feedback.options;
				//only attempt the feedback if user and property exists
				if(opts.user!=undefined&& opts.prop!=undefined){
				var sourceUser;
				var sourceProp;
				switch(opts.user){
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET:
					//look for user with target position in userstring
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

					default:
					//user user selected in dropdown
					sourceUser=opts.user;
						break;
				}
				//match property to value
				var userToFeedback=self.user_data[sourceUser];
				if(userToFeedback!=undefined){
				var propertyToFeedback=opts.prop;
				var userPropVal=userToFeedback[propertyToFeedback];
				//
					if (userPropVal==parseInt(opts.propertyValue)){
						return{
							color:feedback.options.fg,
							bgcolor:feedback.options.bg
						};
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
		//pong message
		function parsePongRecvMsg(msgArgs){
			// self.log('debug', 'connected to zoom');
			self.zoomosc_client_data.last_ping					 =	Date.now();
			self.zoomosc_client_data.zoomOSCVersion			=	msgArgs[1].value;
			self.zoomosc_client_data.subscribeMode			 =	msgArgs[2].value;
			self.zoomosc_client_data.galTrackMode				=	msgArgs[3].value;
			self.zoomosc_client_data.callStatus					=	msgArgs[4].value;
			self.zoomosc_client_data.numberOfTargets		 =	msgArgs[5].value;
			self.zoomosc_client_data.numberOfUsersInCall =	msgArgs[6].value;
			// self.checkFeedbacks('sub_bg');
		}

		//list message
		function parseListRecvMsg(msgArgs,isMe){

	//add the values from the list to the user at index supplied

				var this_user = {
					index:						msgArgs[0].value,
					userName:				 msgArgs[1].value,
					galleryIndex:		 msgArgs[2].value,
					zoomID:					 msgArgs[3].value,
					participantCount: msgArgs[4].value,
					listCount:				msgArgs[5].value,
					role:						 msgArgs[6].value,
					onlineStatus:		 msgArgs[7].value,
					videoStatus:			msgArgs[8].value,
					audioStatus:			msgArgs[9].value,
					spotlightStatus: 0,
					activeSpeaker:		0,
					handStatus:			 0,
					cameraDevices:		[]
					//selected: false


				};
				var roleTextVals=[
					'None','For Users','Always','Full'
				];
				var onOffTextVals=['Off','On'];
				var onlineTextVals=['Offline','Online'];
				var handTextVals=['Down','Up'];
				var activeSpeakerTextVals=['Inactive','Active'];
				this_user.roleText						= roleTextVals[this_user.role];
				this_user.videoStatusText		 = onOffTextVals[this_user.videoStatus];
				this_user.audioStatusText		 = onOffTextVals[this_user.audioStatus];
				this_user.onlineStatusText		= onlineTextVals[this_user.onlineStatus];
				this_user.activeSpeakerText	 = activeSpeakerTextVals[this_user.activeSpeaker];
				this_user.handStatusText			= handTextVals[this_user.handStatus];
				this_user.spotlightStatusText = onOffTextVals[this_user.spotlightStatus];

				//DOES THIS EXIST???
				var updateActions = false;
				if(!(this_user.zoomID in self.user_data)){
					updateActions=true;
				}

				if (this_user.onlineStatus>=0 && this_user.zoomID>=0)
				{
						self.user_data[this_user.zoomID] = this_user;
				}

				//set variables and action properties from received list
				if(isMe){
					self.user_data[this_user.zoomID].me = true;
				}
				else{
					self.user_data[this_user.zoomID].me = false;
				}

				if(updateActions){
					self.actions();

				}

				self.init_feedbacks();

		}

console.log("Received OSC Message: "+ JSON.stringify(message));
//list messages for users/me
var recvMsg=message.address.toString().split('/');
var zoomPart=recvMsg[1];
var msgTypePart=recvMsg[2];
var usrMsgTypePart=recvMsg[3];
 // /zoomosc/galleryShape 1 2
//zoomosc message
if(zoomPart==ZOSC.keywords.ZOSC_MSG_PART_ZOOMOSC){
	//target
	switch(msgTypePart){
		//Me
		case ZOSC.keywords.ZOSC_MSG_PART_ME:
		var isMe=true;
		/*falls through*/
		//User
		case ZOSC.keywords.ZOSC_MSG_PART_USER:
			console.log("user/me MESSAGE RECEIVED");
			// Info: sending OSC message /zoomosc/me/videoOff -1 "squirrel" 1 16780288
			var usrMsgUser=message.args[3].value;
			//type of user message
			switch(usrMsgTypePart){
				//List Received
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_LIST.MESSAGE:
					console.log("LIST RECEIVED");
					//test user name for no user
					// let userNameToTest= message.args[1].value;
					let userZoomID=		 message.args[3].value;
					let userOnlineStatus= message.args[7].value;

					if(userOnlineStatus==0){
						console.log("DELETE OFFLINE USER");
						delete self.user_data[userZoomID];
					}
					else{
						parseListRecvMsg(message.args,isMe);
					}
					parseListRecvMsg(message.args,isMe);

					break;

				//user status messages
				//pins
				case ZOSC.actions.PIN_GROUP.MESSAGES.ZOSC_MSG_PART_PIN.USER_ACTION:
					console.log('pin: '+self.user_data[usrMsgUser]);
					self.user_data[usrMsgUser].pin=1;
					break;
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPOTLIGHT_ON.MESSAGE:
					console.log('Spotlight on');
					self.user_data[usrMsgUser].spotlightStatus=1;
					self.user_data[usrMsgUser].spotlightStatusText='On';
					break;
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_SPOTLIGHT_OFF.MESSAGE:
					console.log('Spotlight off');
					self.user_data[usrMsgUser].spotlightStatus=0;
					self.user_data[usrMsgUser].spotlightStatusText='Off';
					break;
				//AV: VIDEO
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_VIDON.USER_ACTION:
					console.log('vidstatus on: '+self.user_data[usrMsgUser]);
					self.user_data[usrMsgUser].videoStatus=1;
					self.user_data[usrMsgUser].videoStatusText='On';
					break;
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_VIDOFF.USER_ACTION:
					console.log("vidstatus OFF");
					self.user_data[usrMsgUser].videoStatus=0;
					self.user_data[usrMsgUser].videoStatusText='Off';
					break;

				//AV: AUDIO
				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_UNMUTE.USER_ACTION:
					console.log('UNMUTE: ');
					self.user_data[usrMsgUser].audioStatus=1;
					self.user_data[usrMsgUser].audioStatusText='On';
					break;

				case ZOSC.actions.AV_GROUP.MESSAGES.ZOSC_MSG_PART_MUTE.USER_ACTION:
					console.log("MUTE");
					self.user_data[usrMsgUser].audioStatus=0;
					self.user_data[usrMsgUser].audioStatusText='Off';
					break;

				//onlie status
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USER_ONLINE.MESSAGE:
					console.log("online");
					self.user_data[usrMsgUser].onlineStatus=1;
					self.user_data[usrMsgUser].onlineStatusText='Online';
					break;

				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_USER_OFFLINE.MESSAGE:
					console.log("offline");
					self.user_data[usrMsgUser].onlineStatus=0;
					self.user_data[usrMsgUser].onlineStatusText='Offline';

					break;
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_CAMERA_DEVICE_LIST.MESSAGE:
				console.log('Camera devices for: '+usrMsgUser+': '+json.stringify(message.args[4]));

					break;
				//Active speaker/spotlight

				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_ACTIVE_SPEAKER.MESSAGE:
					console.log("active speaker");
					var speakerZoomID=message.args[3].value;

					for(let user in self.user_data){
						if(self.user_data[user].zoomID==speakerZoomID){
							self.user_data[user].activeSpeaker=1;
							self.user_data[user].activeSpeakerText='Active';
							self.zoomosc_client_data.activeSpeaker=self.user_data[user].userName;
						}
						else{
							self.user_data[user].activeSpeaker=0;
							self.user_data[user].activeSpeakerText='Inactive';
						}
					}

					break;

					//Hand Raising
					case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_HAND_RAISED.MESSAGE:
						console.log("Hand Raised");
						self.user_data[usrMsgUser].handStatus=1;
						self.user_data[usrMsgUser].handStatusText='Up';
						break;

					case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_HAND_LOWERED.MESSAGE:
						console.log("hand lowered");
						self.user_data[usrMsgUser].handStatus=0;
						self.user_data[usrMsgUser].handStatusText='Down';
						break;

				default:
					console.log("user message not matched");
					break;


		}

			break;
		//pong message received
		case 'pong':
			parsePongRecvMsg(message.args);
			console.log("PONG RECEIVED");
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
		console.log("Gallery Order Message Received: "+JSON.stringify(message));
		//add order to client data
			self.zoomosc_client_data.galleryOrder=[];
			for(let user in message.args){
				self.zoomosc_client_data.galleryOrder.push(message.args[user].value);
			}
		//delete offline users
			for(let oldUser in self.user_data){
				if(self.user_data[oldUser].onlineStatus==0){
					console.log("Deleting old user: "+oldUser);
					delete self.user_data[oldUser];
					}
					//set all users galleryindex to -1
					self.user_data[oldUser].galleryIndex=-1;

			}

			console.log("gallery order: " + self.zoomosc_client_data.galleryOrder);
			let galleryOrder=self.zoomosc_client_data.galleryOrder;
			for( i=0; i<galleryOrder.length; i++ ){
				let currentZoomID=galleryOrder[i];
				self.user_data[currentZoomID].galleryIndex=i;
				console.log("user: "+self.user_data[currentZoomID].userName+" galindex: "+self.user_data[currentZoomID].galleryIndex);
			}
			for(let user in user_data){
				if(user_data[user].onlineStatus==0){
					console.log("DELETE OFFLINE USER");
					delete self.user_data[user];
				}
			}

			// console.log("Gallery Order Message Received: "+JSON.stringify(self.zoomosc_client_data.galleryOrder));
			break;



		default:
			console.log("zoom message not matched");
			break;
	}
console.log(message.address.toString());
	//match outputFullMessages
	switch(message.address.toString()){

			case ZOSC.outputFullMessages.ZOSC_MSG_SEND_LIST_CLEAR.MESSAGE:
			 console.log("clearing list");
			 self.user_data={};
			 break;

		 default:
			 break;
	}
		self.init_variables();
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
			//set gallery track mode
			self.system.emit('osc_send',
				self.config.host,				self.config.port,
				ZOSC.actions.APP_ACTION_GROUP.MESSAGES.ZOSC_MSG_GALTRACK_MODE.MESSAGE, {type: 'f', value: parseFloat(self.config.galTrackMode)}
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
		//Send ping if last ping sent too long ago
		if (self.zoomosc_client_data.last_ping > 0) {
			if (timesinceping > PING_TIME_ERR - PING_TIMEOUT) {
			pingOSC();
			}
		}
		//Send if ping never sent
		else {
			pingOSC();
		}
		//Set Status to Error in config if ping not responded to
		if (timesinceping > PING_TIME_ERR) {
			self.zoomosc_client_data.state = 'offline';
			self.zoomosc_client_data.zoomOSCVersion			=	"Not Connected";
			self.zoomosc_client_data.subscribeMode			 =	0;
			self.zoomosc_client_data.galTrackMode				=	0;
			self.zoomosc_client_data.callStatus					=	0;
			self.zoomosc_client_data.numberOfTargets		 =	0;
			self.zoomosc_client_data.numberOfUsersInCall =	0;
			self.status(self.STATUS_ERROR);
			self.init_variables();
			// self.user_data={};

			self.init_variables();
		}

		//Set status to OK if ping is responded within limit
		else {
			self.zoomosc_client_data.state = 'online';
			self.status(self.STATUS_OK);
		}
	}
	//Ping timeout loop. cleared when instance disabled
	self.pingLoop = setTimeout(ping, PING_TIMEOUT);
	}, PING_TIMEOUT);
};

//PRESETS
instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];


	// $(zoomosc:userName_galPos_0,0)
	// Generate Audio Preset
	let instanceLabel=self.config.label;
	//gallery position presets
for(let y=0;y<3;y++){
	for(let x=0;x<5;x++){

		//Audio presets
		presets.push({
			category: 'Gallery Audio',
			label: 'Gallery Audio '+y+','+x,
			bank: {
				style: 'text',
				text: '$('+instanceLabel+':userName_galPos_'+y+','+x+')\\n'+'Audio',
				size: 'Auto',
				color: '16777215',
				bgcolor: self.rgb(0,100+(y*30),0)
			},

			//TOGGLE AUDIO
			actions: [{
				action: 'AV_GROUP',
				options: {
					message: 'ZOSC_MSG_PART_TOGGLE_MUTE',
					user: 'galleryPosition',
					userString:y+','+x
				}
			}],
			feedbacks:[{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'audioStatus',
					propertyValue:1,
					bg:self.rgb(0,255,0)
				}

			},
			{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'audioStatus',
					propertyValue:0,
					bg:self.rgb(255,0,0)
				}

			}
		]
		});
		//Video Presets
		presets.push({
			category: 'Gallery Video',
			label: 'Gallery Video '+y+','+x,
			bank: {
				style: 'text',
				text: '$('+instanceLabel+':userName_galPos_'+y+','+x+')\\n'+'Video',
				size: 'Auto',
				color: '16777215',
				bgcolor: self.rgb(0,100+(y*30),0)
			},
			//TOGGLE AUDIO
			actions: [{
				action: 'AV_GROUP',
				options: {
					message: 'ZOSC_MSG_PART_TOGGLE_VIDEO',
					user: 'galleryPosition',
					userString:y+','+x
				}
			}],
			feedbacks:[{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'videoStatus',
					propertyValue:1,
					bg:self.rgb(0,255,0)
				}

			},
			{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'videoStatus',
					propertyValue:0,
					bg:self.rgb(255,0,0)
				}

			}
		]
		});

		//Spotlight Presets
		presets.push({
			category: 'Gallery Spotlight',
			label: 'Gallery Spotlight '+y+','+x,
			bank: {
				style: 'text',
				text: '$('+instanceLabel+':userName_galPos_'+y+','+x+')\\n'+'Spotlight',
				size: 'Auto',
				color: '16777215',
				bgcolor: self.rgb(0,100+(y*30),0)
			},
			//TOGGLE Spotlight
			actions: [{
				action: 'SPOTLIGHT_GROUP',
				options: {
					message: 'ZOSC_MSG_PART_TOGGLE_SPOT',
					user: 'galleryPosition',
					userString:y+','+x
				}
			}],
			feedbacks:[{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'spotlightStatus',
					propertyValue:1,
					bg:self.rgb(0,255,0)
				}

			},
			{
				type:'user_status_fb',
				options:{
					user:ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALLERY_POSITION,
					userString:y+','+x,
					prop:'spotlightStatus',
					propertyValue:0,
					bg:self.rgb(255,0,0)
				}

			}
		]
		});

		//Pin Presets
		presets.push({
			category: 'Gallery Pin',
			label: 'Gallery Pin '+y+','+x,
			bank: {
				style: 'text',
				text: '$('+instanceLabel+':userName_galPos_'+y+','+x+')\\n'+'Pin',
				size: 'Auto',
				color: '16777215',
				bgcolor: self.rgb(0,100+(y*30),0)
			},

			actions: [{
				action: 'PIN_GROUP',
				options: {
					message: 'ZOSC_MSG_PART_TOGGLE_PIN',
					user: 'galleryPosition',
					userString:y+','+x
				}
			}]


		});
	}
}



self.setPresetDefinitions(presets);
};
//Add module to companion
instance_skel.extendedBy(instance);
exports = module.exports = instance;
