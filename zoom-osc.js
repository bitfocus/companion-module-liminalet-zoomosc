//Liminal ZoomOSC Plugin for BitFocus Companion
var instance_skel = require('../../instance_skel');
var OSC 					= require('osc');
//API file
var ZOSC=require('./zoscconstants');

var debug;
var log;

const PING_TIME_ERR = 15000;
const PING_TIMEOUT	= 3000;
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
	self.zoomosc_client_data.subscribeMode			 = 0;
	self.zoomosc_client_data.galleryShape				 = [0,0];
	self.zoomosc_client_data.oldgalleryShape		 = [0,0];
	self.zoomosc_client_data.activeSpeaker			 = "None";
	self.zoomosc_client_data.zoomOSCVersion			 = "Not Connected";
	self.zoomosc_client_data.subscribeMode			 =	0;
	self.zoomosc_client_data.galTrackMode				 =	0;
	self.zoomosc_client_data.callStatus					 =	0;
	self.zoomosc_client_data.numberOfTargets		 =	0;
	self.zoomosc_client_data.numberOfUsersInCall =	0;
	self.zoomosc_client_data.listIndexOffset = 0;
	self.zoomosc_client_data.numberOfSelectedUsers = 0;


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
		{varName:'galleryPosition',		 varString:'galPos',						varLabel:'Gallery Position'},
		{varName:'listIndex',		 varString:'listIndex',						varLabel:'List Index'}

	];
	//variable name in user data, string to tag companion variable
	var variablesToPublishList=[
		{varName:'index',						varString:'index',					 varLabel:"Target ID"},
		{varName:'userName',						varString:'userName',					 varLabel:"User Name"},
		{varName:'galleryIndex',				varString:'galIndex',					 varLabel:'Gallery Index'},
		{varName:'roleText',						varString:'role',							 varLabel:'Role'},
		{varName:'onlineStatusText',		varString:'onlineStatus',			 varLabel:'Online Status'},
		{varName:'videoStatusText',		  varString:'videoStatus',			 varLabel:'Video Status'},
		{varName:'audioStatusText',		  varString:'audioStatus',			 varLabel:'Audio Status'},
		{varName:'spotlightStatusText', varString:'spotlightStatus',	 varLabel:'Spotlight Status'},
		{varName:'handStatusText',			 varString:'handStatus',				 varLabel:'Hand Status'},
		{varName:'activeSpeakerText',	   varString:'activeSpeaker',		 varLabel:'Active Speaker'},
		{varName:'selected',		 varString:'selected',						varLabel:'Selected'},
		{varName: 'currentCameraDevice', varString:'currentCameraDevice',     varLabel:"Camera Device",     isList:false},
		{varName: 'currentMicDevice',    varString:'currentMicDevice',        varLabel:"Microphone Device", isList:false},
		{varName: 'currentSpeakerDevice',varString:'currentSpeakerDevice',    varLabel:"Speaker Device",    isList:false},
		{varName: 'currentBackground',   varString:'currentBackground',       varLabel:"Background",        isList:false},
		{varName: 'cameraDevices',      varString:'cameraDevices',     varLabel:"Camera Device",     isList:true},
		{varName: 'micDevices',         varString:'micDevices',        varLabel:"Microphone Device", isList:true},
		{varName: 'speakerDevices',     varString:'speakerDevices',    varLabel:"Speaker Device",    isList:true}
		// {varName: 'backgrounds',        varString:'backgrounds',       varLabel:"Background",        isList:true}
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
			//if it is a device list, add each device

				let listSize;
				if(thisVariable.isList){
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
								}else{
									thisFormattedVarLabel=thisVariable.varLabel+' for '+thisSource.varLabel+' '+sourceUser[thisSource.varName];
									thisFormattedVarName=thisVariable.varString+'_'+thisSource.varString +'_'+sourceUser[thisSource.varName];
								}

								//clear all variables to '-' if not in a call
								var thisVariableValue;
								if(!self.zoomosc_client_data.callStatus){
									thisVariableValue='-';
								}else{

									//if this is a list, populate with the device name
									if(thisVariable.isList){
										thisVariableValue=sourceUser[thisVariableName][i].deviceName;
									}else{
										thisVariableValue=sourceUser[thisVariableName];
									}

								}

								//if the variable has a value push and set it
								if(thisVariableValue != null && thisVariableValue != undefined){
									//push variable and set
									variables.push({
										label:thisFormattedVarLabel,
										name: thisFormattedVarName
									});
									self.setVariable( thisFormattedVarName, thisVariableValue);
								}

				}

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
						for (let i=0;i<variablesToPublishList.length;i++){
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
		var i =self.zoomosc_client_data.listIndexOffset;
		for (let user in self.user_data) {
			var this_user = self.user_data[user];
			this_user.listIndex = i++;
			console.log("setting variables for user ", this_user);
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
activeSpeaker:'Active Speaker',
listIndexOffset:'Current List Index Offset',
numberOfSelectedUsers:'Number of users in Selection group'

};
var clientVarVal=0;
//
for(let clientVar in clientdatalabels){
	//ZoomOSC Version
	switch(clientVar){
		case 'listIndexOffset':
			clientVarVal = self.zoomosc_client_data.listIndexOffset;
			break;
		case 'zoomOSCVersion':
		case 'callStatus':
		case 'numberOfTargets':
		case 'numberOfUsersInCall':
		case 'activeSpeaker':
			clientVarVal=self.zoomosc_client_data[clientVar];
			break;
		case 'numberOfSelectedUsers':
			clientVarVal = self.zoomosc_client_data.callStatus ? self.zoomosc_client_data[clientVar] : 0;
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
						["listIndex"]:{
							id:"listIndex",
							 label: '--List Index--'
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
							label:'User Identifier',
							id:'userString'
						}
					]
				};
			}

			// split arguments
		let argStr = thisGroup.ARGS;
		let argsRaw = argStr.split(',');
		let args = [];

		argsRaw.forEach(element => {
			// console.log("arg is " + element)
			let parts = element.split(':');
			let types = parts[0].split('|');
			args.push({types: types, name: parts[1]});
		});

		// console.log('ARGS: '+ args);
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
	allInstanceActions["listIndexOffset"] = {
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
		self.init_variables();
		return;
	}

	//set target type
	var TARGET_TYPE=null;
	var userString=null;
	var selectionZoomIDs = [];
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

		case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION:
			//add selected user to selection list
				for (let user in self.user_data){
					if(self.user_data[user].selected){
						selectionZoomIDs.push(user);
					}
				}
				if (selectionZoomIDs.length > 1) {  // multiple users selected
					TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_GROUP_PART_USERS+'/'+ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
					userString = selectionZoomIDs;
				} else {  // single user
					TARGET_TYPE=ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
					userString = parseInt(selectionZoomIDs[0]);
				}
				//self.log('debug', "user selection ("+selectionZoomIDs.length + "): " + userString);
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
		case "listIndex":
				TARGET_TYPE="listIndex";
				//switch to this so we spoof a zoomID message
				var index = parseInt(action.options.userString);
				index += self.zoomosc_client_data.listIndexOffset;

				var users = Object.keys(self.user_data);
				if (users.length > index)
				{
						userString= parseInt(self.user_data[users[index]].zoomID);
				} else {
					userString = 0;
				}

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
		if(arg!='message' && arg!='user' && arg!='userString' && action.options[arg].length>0){
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
	var targetType = TARGET_TYPE;
	if (targetType == "listIndex") targetType = ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID;
	path=	'/'+ZOSC.keywords.ZOSC_MSG_PART_ZOOM+'/'+targetType+'/'+thisMsg.USER_ACTION;
		//make user
	if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_TARGET_PART_GALINDEX||TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_TARGET_PART_TARGET||TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID||TARGET_TYPE == "listIndex"){
		args.push({type:'i',value:parseInt(userString)});
	}
	else if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_PART_ME){

	} else if(TARGET_TYPE==ZOSC.keywords.ZOSC_MSG_GROUP_PART_USERS+'/'+ZOSC.keywords.ZOSC_MSG_TARGET_PART_ZOOMID) {
		selectionZoomIDs.forEach(id => args.push({type:'i',value:parseInt(id)}));
		//self.log('debug', "selectionZoomIDs: " + selectionZoomIDs + ", args: " + JSON.stringify(args))
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
	//TODO: finding a user needs to be a function as this code is repeated 3 times
	else if('INTERNAL_ACTION' in thisMsg){  // Selection Actions
		selectedUser=null;
		if(thisMsg.INTERNAL_ACTION!="clearSelection") {
			for(let user in self.user_data){
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
								selectedUser = user;
								break;
							}
						}
						break;
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_USERNAME:
					//look for user with username in userstring
					for (let user in self.user_data){
						if(self.user_data[user].userName==userString){
							selectedUser=user;
							break;
						}
					}
						break;

					default:
					//user isnt a target type
					for (let user in self.user_data){
						if(self.user_data[user].userName==opts.user){
							selectedUser=user;
							break;
						}
						break;
				}
		}
	}
}

		switch(thisMsg.INTERNAL_ACTION){
			case "addSelection":
				self.user_data[selectedUser].selected = true;
				self.log('debug', "Add selection to " + self.user_data[selectedUser].userName);
				break;
			case "removeSelection":
				self.user_data[selectedUser].selected = false;
				self.log('debug',"Remove selection from " + self.user_data[selectedUser].userName);
				break;
			case "toggleSelection":
				self.user_data[selectedUser].selected = !(self.user_data[selectedUser].selected);
				self.log('debug',"Toggle selection " + self.user_data[selectedUser].userName);
				break;
			case "clearSelection":
				for (let user in self.user_data){
					self.user_data[user].selected = false;
				}
				self.log('debug',"Clear selection");
				break;
			default:
				break;
		}
		self.zoomosc_client_data.numberOfSelectedUsers = Object.values(self.user_data).reduce(function(acc, user) { return user.selected + acc; }, 0);
		self.setVariable('client_numberOfSelectedUsers', self.zoomosc_client_data.numberOfSelectedUsers);
		this.checkFeedbacks();
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
			{id:'selected',		label:'Selected'},
			{id:'cameraDevice',label:'Current Camera Device'},
			{id:'micDevice',label:'Current Mic Device'},
			{id:'speakerDevice',label:'Current Speaker Device'}

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
					case ZOSC.keywords.ZOSC_MSG_TARGET_PART_SELECTION:
						return; // not supported
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
						case 'listIndex':
						//look for user with username in userstring
						for (let user in self.user_data){
							if(self.user_data[user].listIndex==opts.userString){
								sourceUser=user;
								break;
							}
						}
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
			// self.log('debug', 'connected to zoom');
			self.zoomosc_client_data.last_ping					 =	Date.now();
			self.zoomosc_client_data.zoomOSCVersion			 =	msgArgs[1].value;
			self.zoomosc_client_data.subscribeMode			 =	msgArgs[2].value;
			self.zoomosc_client_data.galTrackMode				 =	msgArgs[3].value;
			self.zoomosc_client_data.callStatus					 =	msgArgs[4].value;
			self.zoomosc_client_data.numberOfTargets		 =	msgArgs[5].value;
			self.zoomosc_client_data.numberOfUsersInCall =	msgArgs[6].value;
			// self.checkFeedbacks('sub_bg');
		}

		//list message
		function parseListRecvMsg(msgArgs,isMe){

	//add the values from the list to the user at index supplied

				var this_user = {
					index:						msgArgs[0].value,
					userName:				  msgArgs[1].value,
					galleryIndex:		  msgArgs[2].value,
					zoomID:					  msgArgs[3].value,
					participantCount: msgArgs[4].value,
					listCount:				msgArgs[5].value,
					role:						  msgArgs[6].value,
					onlineStatus:		  msgArgs[7].value,
					videoStatus:			msgArgs[8].value,
					audioStatus:			msgArgs[9].value,
					spotlightStatus:  0,
					activeSpeaker:		0,
					selected: false,
					handStatus:			  0,
					cameraDevices:		[],
					micDevices:       [],
					speakerDevices:   [],
					backgrounds:      []


				};
				var roleTextVals=[
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

				self.zoomosc_client_data.numberOfSelectedUsers = 0;

				self.init_feedbacks();

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
			//type of user message
			switch(usrMsgTypePart){
				//List Received
				case ZOSC.outputLastPartMessages.ZOSC_MSG_SEND_PART_LIST.MESSAGE:
					// console.log("LIST RECEIVED");
					//test user name for no user
					// let userNameToTest= message.args[1].value;
					let userZoomID=		 message.args[3].value;
					let userOnlineStatus= message.args[7].value;

					if(userOnlineStatus==0){
						// console.log("DELETE OFFLINE USER");
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
		if (timesinceping > PING_TIME_ERR) {
			self.zoomosc_client_data.state = 'offline';
			self.zoomosc_client_data.zoomOSCVersion			=	"Not Connected";
			self.zoomosc_client_data.subscribeMode			 =	0;
			self.zoomosc_client_data.galTrackMode				=	0;
			self.zoomosc_client_data.callStatus					=	0;
			self.zoomosc_client_data.numberOfTargets		 =	0;
			self.zoomosc_client_data.numberOfUsersInCall =	0;
			self.zoomosc_client_data.numberOfSelectedUsers = 0;
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
for(let y=0;y<4;y++){
	for(let x=0;x<8;x++){

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
