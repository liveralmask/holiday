var global = this;
var g_ics_url = "https://www.google.com/calendar/ical/ja.japanese%23holiday%40group.v.calendar.google.com/public/basic.ics";
ogas.cache.properties( PropertiesService.getScriptProperties() );

function debug(){
  var response = global.run({});
  if ( undefined !== response ) ogas.log.dbg( response.getContent() );
}

function doGet( e ){
  return global.run({});
}

(function( action ){
  action.on_begin_event = function( params ){
    params.holiday = {};
    return params;
  };
  
  action.on_target = function( params ){
    params.holiday.year  = Number( params.match.matches[ 1 ] );
    params.holiday.month = Number( params.match.matches[ 2 ] );
    params.holiday.date  = Number( params.match.matches[ 3 ] );
    return params;
  };
  
  action.on_summary = function( params ){
    params.holiday.summary = params.match.matches[ 1 ];
    return params;
  };
  
  action.on_end_event = function( params ){
    params.holidays.push( params.holiday );
    params.holiday = {};
    return params;
  };
  
  action.update = function( request ){
//    ogas.log.inf( ogas.json.encode( request ) );
    var response = "";
    if ( "response" in request ){
      response = request.response;
    }else{
      response = ogas.json.encode( { holidays : action.holidays( request.ics ) } );
      ogas.sheet.range( ogas.vars.get( "response_sheet" ), "A1" ).setValue( response );
    }
    return ogas.http.response( "json", response );
  };
  
  action.holidays = function( ics ){
    var _holidays = {};
    var params = {
      holiday  : {},
      holidays : [],
    };
    var ics_len = ics.length;
    for ( var i = 0; i < ics_len; ++i ){
      var match = ogas.pattern.match( "action", ics[ i ] );
      if ( null === match ) continue;
      
      params.match = match;
      var result = ogas.method.call( action, ogas.string.format( "on_{0}", match.value.name ), params );
      if ( undefined !== result ) params = result;
    }
    
    ogas.array.each( params.holidays, function( holiday, i ){
      if ( ! ( holiday.year in _holidays ) ){
        _holidays[ holiday.year ] = {};
      }
      if ( ! ( holiday.month in _holidays[ holiday.year ] ) ){
        _holidays[ holiday.year ][ holiday.month ] = {};
      }
      
      _holidays[ holiday.year ][ holiday.month ][ holiday.date ] = holiday.summary;
    });
    return _holidays;
  };
})(global.action = global.action || {});

global.run = function( request ){
  request.time = ogas.time.local_time();
  return ogas.application.run( global.Application, request );
};

global.Application = function(){
  ogas.Application.call( this );
};
ogas.object.inherits( global.Application, ogas.Application );
global.Application.prototype.start = function(){
  var spreadsheet_id = ogas.cache.get( "spreadsheet_id" );
  if ( null === spreadsheet_id ){
    ogas.log.err( "Not found spreadsheet_id" );
    return;
  }
  
  var spreadsheet = ogas.spreadsheet.open( spreadsheet_id );
  if ( null === spreadsheet ){
    ogas.log.err( "Spreadsheet open error id={0}", spreadsheet_id );
    return;
  }
  ogas.vars.set( "spreadsheet", spreadsheet );
  
  ogas.log.sheet( ogas.sheet.open( spreadsheet, "log" ) );
  
  ogas.application.sheet( this, spreadsheet, "rules" );
  ogas.application.sheet( this, spreadsheet, "response" );
  
  this.m_is_update = true;
};
global.Application.prototype.update = function(){
  do{
    this.response( global.action.update( this.m_request ) );
  }while ( false );
};
global.Application.prototype.end = function(){
  
};
global.Application.prototype.on_sheet_rules = function( sheet ){
  if ( "" === ogas.sheet.range( sheet, "A1" ).getValue() ){
    ogas.sheet.add_row( sheet, [ "name", "pattern", "flags" ] );
    ogas.sheet.add_row( sheet, [ "begin_event", "BEGIN:VEVENT" ] );
    ogas.sheet.add_row( sheet, [ "target", "DTSTART;VALUE=DATE:([0-9]{4})([0-9]{2})([0-9]{2})" ] );
    ogas.sheet.add_row( sheet, [ "summary", "SUMMARY:(.+)" ] );
    ogas.sheet.add_row( sheet, [ "end_event", "END:VEVENT" ] );
  }
  
  ogas.application.add_patterns( "action", sheet );
};
global.Application.prototype.on_sheet_response = function( sheet ){
  var value = ogas.sheet.range( sheet, "A1" ).getValue();
  var response = ( "" === value ) ? {} : ogas.json.decode( value );
  var next_year = this.m_request.time.year() + 1;
  do{
    if ( ! ( "holidays" in response ) ) break;
    if ( ! ( next_year in response.holidays ) ) break;
    
    this.m_request.response = value;
    return;
  }while ( false );
  
  var result = ogas.http.request( g_ics_url );
  this.m_request.ics = result.getContentText().split( /\r\n|\r|\n/ );
};
