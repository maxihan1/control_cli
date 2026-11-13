# 표준 화면(샘플)을 Robot Framework 키워드로 — Python 드라이버(drivers/python/control_cli.py)를 라이브러리로 그대로 쓴다
*** Settings ***
Documentation     robot --pythonpath drivers/python --variable GAME:tcp://127.0.0.1:13100 drivers/robot/standard.robot
...               키워드는 드라이버 메서드 이름 그대로(find_all → Find All). 고를 칸은 이름=값(inactive=${True}), 답은 게임 답 dict.
Library           control_cli.Game    ${GAME}

*** Variables ***
${GAME}           tcp://127.0.0.1:13100

*** Test Cases ***
게임이 답한다
    ${r}=    Ping
    Should Not Be Empty    ${r}[app]
    Should Contain    ${r}[caps]    find-all

입력칸에 넣고 로그인을 누르면 상태 글자가 바뀐다
    ${r}=    Type    IdInput    qa_user01!
    Should Be Equal    ${r}[text]    qauser01
    Click    LoginButton
    Wait Until Keyword Succeeds    5s    0.3s    글자에 들어 있다    StatusText    login qauser01

선택자로 여럿을 찾는다
    ${r}=    Find All    //Bag/Slot
    Length Should Be    ${r}[found]    4
    Should Be Equal    ${r}[found][-1][path]    /SampleCanvas/Bag/Slot[3]

꺼진 오브젝트는 inactive 로만 찾는다
    ${r}=    Find    HiddenText
    Should Not Be True    ${r}[found]
    ${r}=    Find    HiddenText    inactive=${True}
    Should Be Equal    ${r}[text]    hidden

static 메서드를 부른다
    ${r}=    Static Call    Sample.TouchProbe.Add    args=${{['2', '3']}}
    Should Be Equal As Numbers    ${r}[value]    5

저장 값을 넣고 읽고 지운다
    Pref Set    robot_int    7    type=int
    ${r}=    Pref Get    robot_int    type=int
    Should Be Equal As Numbers    ${r}[value]    7
    Pref Delete    robot_int
    ${r}=    Pref Get    robot_int    type=int
    Should Not Be True    ${r}[found]

입력칸에 text-set 은 게임이 거절한다
    Run Keyword And Expect Error    *type*    Text Set    IdInput    x

*** Keywords ***
글자에 들어 있다
    [Arguments]    ${target}    ${text}
    ${r}=    Find    ${target}
    Should Contain    ${r}[text]    ${text}
