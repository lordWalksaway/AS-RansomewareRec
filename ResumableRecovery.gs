//THIS IS THE ONLY LINE THAT NEEDS MODIFIED BEFORE NEW RUN
var flagTimeLow = '2016-12-22T22:00:00.000Z', flagTimeHigh = '2016-12-23T02:00:00.000Z';
//
//Get root, change this to start elsewhere via DriveApp.getFolderById(id)
var curFolder = DriveApp.getRootFolder();
//
var logSheet = SpreadsheetApp.getActiveSpreadsheet();
var foldersName = 'Folders', filesName = 'Files', logName = 'Log', fileCleanFlag = 'clean', fileWarnFlag = 'warning', 
    lastFolder = 'lastFolder', lastFolderPath = 'lastFolderPath';
var foldersCount = 0, skippedFoldersCount = 0, filesCount = 0, cleanedFilesCount = 0, doneFoldersCount=0, tmp=0;
//Get folders pages
var foldersPage = logSheet.getSheetByName(foldersName);
var filesPage   = logSheet.getSheetByName(filesName);
var logPage     = logSheet.getSheetByName(logName);
var runStart = new Date();
var timeoutDuration = 282000;// 4.7 minutes of 6 max on 5min loop with chron job
var properties = PropertiesService.getUserProperties();
var pathString = ["~.\\"];
var quit = false;


function main() {
  createWorksheets();
  resume();
  log('#New Run @ '+pathString.toString().replace(/,/g,''));
  while (!quit) {
    processFolder(curFolder);
    if (curFolder.getId() == DriveApp.getRootFolder().getId()) {
      break;
    }
    else {
      curFolder = curFolder.getParents().next(); //to parent
      pathString.pop();
    }
  }
  if (!quit) { //finish in style
    log('Finished! '+finishText());
    properties.setProperty(lastFolder, '');
    properties.setProperty(lastFolderPath, '');
  }
  
}

//Creates and sizes worksheets if they don't exist, otherwise does nothing.
function createWorksheets() {
  if (logPage == null) { //Deleting or renaming log page will forcefully reset last folder.
    logSheet.insertSheet(logName);
    logPage = logSheet.getSheetByName(logName);
    logPage.setColumnWidth(1, 200);
    logPage.setColumnWidth(2, 750);
    logPage.getRange('B1:B').setWrap(true);
    log('Created '+logName+' worksheet.');  
    //Create first-run preferences.
    properties.setProperty(lastFolder, '');
    properties.setProperty(lastFolderPath, '');
  }
  if (foldersPage == null) {
    log('Created '+foldersName+' worksheet.');   
    logSheet.insertSheet(foldersName);
    foldersPage = logSheet.getSheetByName(foldersName);
    foldersPage.appendRow(['Timestamp','folderName','folderID','state','path']);
    foldersPage.setColumnWidth(1, 200);
    foldersPage.setColumnWidth(2, 150);
    foldersPage.setColumnWidth(4, 35);
    foldersPage.getRange('D2:D').setWrap(true);     
  }
}

//picks up where we left off if the property exists.
function resume() {
 if (properties.getProperty(lastFolderPath) != '') {
   curFolder = DriveApp.getFolderById(properties.getProperty(lastFolder));
   tmp = properties.getProperty(lastFolderPath).split('\\');
   pathString = [''];
   for (var i=0;i<tmp.length;i++) //builds array for path
     if(tmp[i]!='') pathString.push(tmp[i]+'\\');   
//   pathString.push(curFolder.getName()+'\\');
 }
}

//Recursive folder and file search. Skips files when folderDoneFlag per folder.
//Receives folder object, returns true when done or false when exiting.
function processFolder(folder) {
  var dirCheck = folderCheck(folder);
  if (dirCheck==2) return true;
  Logger.log('Stepping into: '+folder.getName());
  foldersCount++;
  //If we have changed directory then post it to log
  if (tmp != pathString.toString().replace(/,/g,'')) {
    tmp = pathString.toString().replace(/,/g,'');
    log('cd '+tmp);
  }
  if(dirCheck<1){ //If folder not yet processed
    var files = folder.getFiles();
    while (files.hasNext()){//process files before folders
      var file = files.next();
      deleteRevisions(file);
      filesCount++;
      timeCheck(folder);
      if(quit)return false;
    }
    foldersLog(folder,1);//indicates files scrubbed.
  }
  var childFolders = folder.getFolders();
  while(childFolders.hasNext()) {
    if(quit) return false; //exiting for time
    var childFolder = childFolders.next();
    if (folderCheck(childFolder)==2)//Checks for done tag, skip files if found
      skippedFoldersCount++;
    else {//build path object
      pathString.push(childFolder.getName()+'\\');
      processFolder(childFolder);
      pathString.pop();
    }
  }
  if (verifyDone(folder)) { //verify, log and finish.
    foldersLog(folder, 2);//doneFlag
    doneFoldersCount++;
    properties.setProperty(lastFolder, folder.getId());
    properties.setProperty(lastFolderPath, pathString.toString().replace(/,/,''));
    return true;
  }
}
  
//Receives file object and returns status of revision removal (true) or false if nothing removed.
function deleteRevisions(file) {
  var fileId = file.getId();
  try { //Catch files that don't support revisions
    var revisions = Drive.Revisions.list(fileId);
    if (revisions.items && revisions.items.length > 1) {//Exclude those without multiple revisions
      for (var i = 0; i < revisions.items.length; i++) {
        try {
          var revision = revisions.items[i];
          var date = revision.modifiedDate;
          if(date > flagTimeLow && date < flagTimeHigh) {
            fileLog(file,fileCleanFlag,'Deleting revision at '+date);
            cleanedFilesCount++;
            Logger.log(Drive.Revisions.remove(fileId, revision.id));
            return true;//removed something
          }
        }
        catch (timeout) {
          Utilities.sleep(150);
          Logger.log(file.getName()+' -s150- '+timeout.message);
        }
      }
    }
  }
  catch (error) {
    if (error.message != 'File does not support revisions'){
      fileLog(file, fileWarnFlag,error.message+'.');
      return false;
    }
    else 
      fileLog(file, fileCleanFlag,error.message+'.');
  }
  fileLog(file,fileCleanFlag,'Not encrypted.');
  return false;
}
  
//A folder may not be marked done until its' contents are all clean and done.
//This function receives a folder and returns true if all subfolders and files are
//flagged as done.
function verifyDone(folder) {
  var subFolders = folder.getFolders();
  var files = folder.getFiles();
  while (files.hasNext()){
      var file = files.next();
      if (deleteRevisions(file))//if even one item is found then we aren't done here.
        return false;
  }
  while (subFolders.hasNext()){
    var subFolder = subFolders.next();
    if (folderCheck(subFolder)<2)
      return false;
  }
  return true;
}
  
//Append log and timestamp
function log(message) { 
  var time = new Date().toUTCString();  
  logPage.appendRow([time,message]);
}
  
//creates new line.
function fileLog(file, state, note) {
  Logger.log(new Date().toUTCString()+':'+pathString.toString().replace(/,/g,'')+file.getName()+'   -   '+state+' ('+note+').');
}
  
//Receives folderID and note, seeks to find existing folderID and changes third column
//to reflect note and return true, otherwise creates new line with note and returns false.
function foldersLog(folder, state){
  var content = foldersPage.getDataRange().getValues();
  for(var y=1; y<content.length; y++){
    if(content[y][2].toString() == folder.getId()){//Match
      foldersPage.getRange(y+1,4).setValue(state);
      foldersPage.getRange(y+1,5).setValue(pathString.toString().replace(/,/g,''));
      return true;
    }
  }
  foldersPage.appendRow([new Date().toUTCString(),folder.getName(),folder.getId(),state,pathString.toString().replace(/,/g,'')]);
  return false; //Not found
}
  
//Receives a folder and checks the third column of the folders sheet for its existence.
//If found, it will evaluate the state of the third column and return the corresponding values
//0 == just added
//1 == files cleared
//2 == files & folders cleared
function folderCheck(folder) {
  var content = foldersPage.getDataRange().getValues();
  for(var y=1; y<content.length; y++){
    if(content[y][2].toString() == folder.getId()){//Match
      return content[y][3];
    }
  }
  //folderID not found
  foldersPage.appendRow([new Date().toUTCString(),folder.getName(),folder.getId(),0,pathString.toString().replace(/,/g,'')]);
  return 0;
} 
//Returns true if timeout is reached
function timeCheck(folder) {
  var now = new Date();
  if (now.getTime() - runStart.getTime() >= timeoutDuration) {
    properties.setProperty(lastFolder, folder.getId());
    properties.setProperty(lastFolderPath, pathString.toString().replace(/,/g,''));
    var finText = finishText();
    log('Timeout exit.'+finText);
    quit = true;
    return true;
  }
  return false;
}
  
//returns finish string.
function finishText(){
  var fps = Math.round((foldersCount+filesCount+skippedFoldersCount+cleanedFilesCount+doneFoldersCount)/((new Date().getTime()-runStart.getTime())/1000)*1000)/1000;
  var finishMessage = ' @ '+fps+' reviews per second. ('+foldersCount+') folders & ('+filesCount+') files reviewed. ('+cleanedFilesCount+') file modifications, ('
    +doneFoldersCount+') finished folders and ('+skippedFoldersCount+') skipped folders. '+DriveApp.getFolderById(properties.getProperty(lastFolder)).getName()
    +' was the last folder viewed.';
  return finishMessage;
}
