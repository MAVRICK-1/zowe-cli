# Order of authentication in Zowe Clients

This document proposes a design to enable users to specify the order in which credentials are selected for authentication when multiple credentials are specified by the user.

Users may not intentionally specify multiple credentials for the same operation. However, because configuration properties can be inherited from a base profile or within nested profiles, it is possible that multiple credentials may be available when a Zowe client attempts to make a connection to a mainframe service.

## Use cases

A user may use the same user and password to authenticate to most of their services. It makes sense to place that user & password in a base profile so that they are automatically available to every service. This reduces redundancy and reduces maintenance efforts. If one plugin requires a token for authentication, the user would store a token value within that plugin's profile. For that plugin, both the user & password and a token will be available when Zowe CLI attempts to make a connection to that service. For this example, the token is the right choice for this service.  For historical reasons, Zowe always selects a user & password over a token when both are available. The use of user & password does not give the desired results.

In another example, sites gradually deploy API-ML and can easily encounter another (but opposite) authentication issue. Sites login to APIML to obtain a token, which is then used to authenticate all future requests to services through API-ML. The API-ML token is typically stored in a base profile so that connections to all services are done through API-ML with its token. When a new service is brought on-line at a site, it is common for that service to not be immediately integrated with APIML. For at least a period of time, the site makes a direct connection to that service. The site adds user/password properties to that service's profile to authenticate that direct connection. Once again, both user & password and a token are available when Zowe attempts to connect to the service for that profile. In this case, the user & password are the right choice for this service. However, this is the opposite choice from the previous example.

As these examples demonstrate, Zowe cannot simply change which authentication type should be given preference. It varies based on what a site is trying to do. That order might also change from one part of the customer's configuration to another. The preferred order in which credentials are chosen is further complicated when we consider that certificates may also be used by a site for some of its services.

## General approach for a solution

In this section we identify the key features that a solution would have to provide.

- The order in which different types of authentication are used should be controlled by the user in the Zowe client configuration.

- The user must be able to change that authentication order for different parts of the Zowe client configuration.

- Zowe client logic must be enhanced to select the authentication type for a profile based on a user-specified preferred order.

- Zowe client extenders (CLI plugins and ZE extensions) should **<u>not</u>** be able to alter the order of authentication types. The user should control that choice.

## Detailed requirements

- If a user does not specify the order of authentication, Zowe should use the historical order of authentication so that we do not introduce a breaking change.

- Zowe has an order of precedence for obtaining property values (config file, environment variable, command line). While a command line option will override the same property stored in a config file, it should not alter the order of authentication.
  
  - For example, assume that a user has specified that a certificate should be used before a token. Assume that a certificate is supplied in a config file and a token is supplied on the command line.
    
    - The certificate should be used because the user-configured authentication order specifies that certificates should be used before tokens.
    
    - The token should not be used just because it was supplied on the command line.

- Zowe should ignore any authentication order property that is specified in a environment variable (unlike most other connection properties).
  
  - A single environment variable property would override **every** authentication order property specified in **every** profile within the user's zowe.config.json file. The most likely customer use of this property will be to specify a different authentication order for different profiles. A single environment variable would likely defeat the primary purpose of enabling a user to specify a different authentication order for different profiles.

- The authentication order **could** be specified on the command line. However, in the initial implementation of this feature, Zowe CLI will **NOT** implement a command line option for the authentication order.
  
  - Conceptually, specifying an authentication order as a command line option is a reasonable idea. However, implementing that behavior could involve modifications to dozens of CLI command handlers, which could increase our implementation effort and time-to-market significantly.
  
  - It is not clear whether a command line option for authentication order will be particularly valuable to customers. The authentication order would typically be static for a given profile. It is unlikely to change from one CLI command to another.
  
  - Therefore, we will **NOT** implement a command-line option for authentication order until customer demand makes such work a priority.

- The authentication order only identifies the order in which Zowe chooses the **<u>one</u>** authentication method that will be used. If that first authentication method fails, Zowe will not make a second attempt to authenticate with any of the later authentication methods.

- Once an authentication is selected, our logic should ensure that only that one type of authentication is placed into a session object. Thus, logic in down-stream Zowe code will not alter the order of authentication selection, simply by testing for the authentications from the session in a different order than the order that the user specified.
  
  - If we were to continue to allow multiple authentications to be placed into a session, we will have to re-work various functions to test for authentications in the desired order. We will also have to provide the object containing that well-defined order to each such function. This will increase the amount of code being changed, and thus increase the time to market and increase the probability of mistakes.

- Zowe clients do not currently support AUTH_TYPE_CERT_PFX, so we cannot add it to a set of available authentications at this time. If AUTH_TYPE_CERT_PFX is implemented, it should be placed immediately after AUTH_TYPE_CERT_PEM in the default order.

- Customers should be able to specify AUTH_TYPE_NONE in their preferred order of authentications. While it is not advisable to have no authentication, if a customer has a service that requires no authentication, the customer should be able to specify AUTH_TYPE_NONE at the top of their list of authentications applicable to that particular profile.

- A customer should not have to specify every possible authentication in their ordered list of authentications. If a site only uses password and tokens, the customer should be able to specify only those two authentications in their list.

- If a customer-specified list of authentications contains none of our supported authentications, a default order will be used.

- The `--show-input-only` option should show the order of authentication as part of its displayed connection properties.

## Historical behavior

The objective of this feature is to enable users to define the order in which an authentication type is selected. However, when a user does not specify any such order, the default order should reflect past behavior.

- The AbstractRestClient currently enforces an order of:
  
  - AUTH_TYPE_TOKEN
  - AUTH_TYPE_BASIC
  - AUTH_TYPE_BEARER
  - AUTH_TYPE_CERT_PEM

- Zowe classes other than AbstractRestClient (like AbstractSession) currently override the authentication order from AbstractRestClient into:
  
  - AUTH_TYPE_BASIC
  - AUTH_TYPE_TOKEN
  - AUTH_TYPE_BEARER
  - AUTH_TYPE_CERT_PEM

These selections of authentication should be maintained as the default selections for their respective classes to avoid introducing a breaking change.

## Configuration enhancement

A new profile property named **authOrder** should be created to enable users to specify their order of precedence for  the authentication to be used when making a REST connection. The authOrder property should be treated like one of our key connection properties (like host and port). Thus authOrder would have the following characteristics:

- It must be specified within a "properties" object. That "properties" object could reside in:
  
  - A base profile
  
  - A parent profile of a nested configuration.
  
  - Any service profile.
  
  - Any profile specific to a plugin (or VSCode extension) that supports a REST connction. For example an **endevor** profile could contain an **authOrder** property, but an **endevor-location** profile would not.

- Our existing inheritance of connection properties should also apply to the inheritance of the authOrder property.

- We should be able to use our logic for where and how the **rejectUnauthorized** property is handled as a model for how we handle the **authOrder** property.

- A new property can be added to the **properties** of any profile. Since we are proposing that **authOrder** be handled by imperative functions, no CLI plugin or ZE extension will need modification for the **authOrder** property to be correctly handled.

- Such a new item within the properties object will not currently be included in the zowe.schema.json file. An IntelliSense-like editor will not display **authOrder** as an option when a user starts to add a new property in a profile.
  
  - We do not want to require plugins/extensions to add **authOrder** to their profiles. Asking extenders  to add AuthOrder to their set of options (and thus the schema) in the middle of a release's lifecycle can be a burden for those contributors.
  
  - As a result, we feel that losing IntelliSense is an acceptable compromise to avoid adding work to every extender. Users will lose a nice convenience, but the user's config will not be limited in any way at runtime.

To represent a series of values, the **authOrder** property should be  an array. The following example shows how a user could specify their desired authOrder.

```
"properties": {
    "host": ... ,
    "port": ... ,
    "rejectUnauthorized": ... ,
    "authOrder": [ "basic", "token", "cert-pem" ]
}
```

The programmatic definition of authOrder would be:

```
authOrder: SessConstants.AUTH_TYPE_CHOICES[]
```

The current set of AUTH_TYPE_CHOICES are:

- AUTH_TYPE_BASIC = "basic"

- AUTH_TYPE_BEARER = "bearer"

- AUTH_TYPE_TOKEN = "token"

- AUTH_TYPE_CERT_PEM = "cert-pem"

- AUTH_TYPE_NONE = "none"

We should add a new AUTH_TYPE_CHOICE of:

- AUTH_TYPE_SSH_KEY = "ssh-key"

That addition would enable customers to also specify the authentication order of precedence for an SSH connection using an authOrder property. The only permissible values for an ssh connection would be "basic" and "ssh-key". Our ssh-handling logic will have to be modified to enforce that restriction and to honor the order. Conversely, our zosmf-handling logic would have to be modified to reject "ssh-key" in authOrder (or at least ignore it). If we choose not to implement authOrder for ssh at this time, we should at least create a design and implementation that can tolerate the addition of "ssh-key" at a later date.

## Documentation Impact

- We must describe the purpose and function of the new authOrder property.

- We must describe where users can place the authOrder property.

- We must describe the default order of authentication, when no authOrder property is supplied.

- We must document that the new authOrder property name is a  Zowe reserved word that should **NOT** be used by any extender.

- We must notify extenders to guide their customers to supply an appropriate authOrder property if their extension needs a non-default order.

## Edge cases that must be confirmed during implementation

Every edge case was not included in the protype used to confirm the validity of this design document. The following edge cases must be confirmed and appropriate logic must be written during the implementation of this design.

- As an alternative to user & password, a property named base64EncodedAuth can be used in a session. The new APIs must handle this alternative.

- To login to APIML, a user supplies a user & password (or cert) and receives a token. The new APIs must determine the correct authentication type for such a session which kind of morphs its authentication type during the transaction.

- Zowe Explorer currently inherits the same hard-coded order as the CLI from the client SDKs. The new authentication order APIs must be integrated into the APIs used by Zowe Explorer. We must confirm whether any additional logic changes must be made within Zowe Explorer itself.

- TSO commands can create a sequence of actions, which use a user & password, receive a token from TSO, and then use that token for additional actions. This change in authentication type during the life of a single transaction may be self contained within the transaction and may not not influenced by either the existing hard-coded authentication order or the new user-controlled authentication order. This behavior must be confirmed and modifications made if necessary.

## A new class must be created to support authOrder

A new class located in:

    [zowe-cli/packages/imperative/src/rest/src/session/AuthOrder.ts](https://github.com/zowe/zowe-cli/blob/master/packages/imperative/src/rest/src/session/AuthOrder.ts)

should be implemented to detect the authentication order supplied by a user, and place the correct set of credentials into a session. The class currently exists as a workable proof of concept. With no confirmation of the many edge cases, it does appear to accomplished the basic needs. It can be finalized once it is fully integrated with existing Zowe logic.

This class is declared **@internal** which will limit its use to the imperative package. More access can be provided during implementation if we identify additional places in Zowe code that need to use functions from this class.

Functions in the AuthOrder class include:

- setTopDefaultAuth - This function will set the top authentication choice (either basic or token) when a default authOrder must be created because the user did not supply an auth order. Through the use of this function we can maintain backward compatibility and not introduce a breaking change.
  
  When authOrder has not been configured into zowe.config.json, we create a default order to be backward compatible.
  
  - If an argument of AUTH_TYPE_TOKEN is supplied, it should place token at the top of the order, resulting in this order:
    
    - AUTH_TYPE_TOKEN
    
    - AUTH_TYPE_BASIC
    
    - AUTH_TYPE_BEARER
    
    - AUTH_TYPE_CERT_PEM
    
    - AUTH_TYPE_NONE
  
  - If AUTH_TYPE_BASIC is supplied (or this function is not called), it should place basic at the top of the order, resulting in this order:
    
    - AUTH_TYPE_BASIC
    
    - AUTH_TYPE_TOKEN
    
    -  AUTH_TYPE_BEARER
    
    - AUTH_TYPE_CERT_PEM
    
    - AUTH_TYPE_NONE
  
  - It should be called from AbstractRestClient.constructor to replace its hard-coded array of credential types.
  
  - It might be called from other existing locations as needed.

- putTopAuthInSession - This function will find the highest auth type (according to the authOrder) which exists in either the supplied session config or command line arguments, place the credentials associated with that auth type into the supplied session config, and remove the credentials for all other auth types from the supplied session config.
  
  - It might be called from ConnectionPropsForSessCfg.addPropsOrPrompt.
    
    - By temporarily modifying a local copy of addPropsOrPrompt to call putTopAuthInSession, I confirmed that the resulting session object contained only those credentials obtained from the command arguments associated with highest authentication type (as determined from the authOrder).
  
  - It might be called from ConnectionPropsForSessCfg.resolveSessCfgProps.
  
  - It might be called from ProfileInfo.createSession.
    
    - While apps like ZE do not take command line arguments, they do form an ICommandArguments object. The createSesion function already has such an object, so it can be passed to putTopAuthInSession.
    
    - Any other location in ZE-related code which needs to call putTopAuthInSession will need to form an ICommandArguments object.
  
  - It might be called from other existing locations as needed.

- cacheAuthOrder - This function stores the authOrder property from the supplied command arguments for later use. In the prototype, it is only called from putTopAuthInSession. However, cacheAuthOrder is available should we find that we need to to call it from other locations (like at the end of the CommandProcessor.prepare function).

- removeExtraCredsFromSess - This function removes all credential properties from the supplied session except for the top available authentication type. In the prototype, it is only called from putTopAuthInSession. However, removeExtraCredsFromSess is available should we find that we must scrub unneeded credentials from a session in other location in existing Zowe code.

## Functions that reference AUTH_TYPE may need modification

The set of candidates for modification consist of all functions that contain the string ***"AUTH_TYPE_"***. This section contains an assessment of whether each such function affects the authentication order and must be modified.

- cli\src\config\auto-init\ApimlAutoInitHandler
  
  - doAutoInit - This function logins into APIML with the session object if either user & password or cert are in the session object. doAutoInit does not make a selection of order. However, it is passed an AbstractSession object. The session credentials should already have been placed into the AbstractSession by a previously called function
    - **Modify doAutoInit ?  <span style="color:green">No</span>**

- core\src\rest\ZosmfRestClient.ts
  
  - processError - This function just alters error message text based on authentications found in the session. If only the top authentication type resides in a session, then no need to change.
    - **Modify processError ?  <span style="color:green">No</span>**

- imperative\src\config\src\ConfigAutoStore.ts
  
  - _fetchTokenForSessCfg - Since this function is used to explicitly retrieve a token value to be auto-stored into a session config, its use of AUTH_TYPE_TOKEN does not affect the auth order. So, no need to change.
    - **Modify _fetchTokenForSessCfg ? <span style="color:green">No</span>**

- imperative\src\imperative\src\config\cmd\import\import.handler.ts
  
  - buildSession - This function is used to import a config from a URL. That URL is an arbitrary location at a customer site where a config file is kept. It is not the target of a REST request to a mainframe service. By design, the only authentication that it will use is user & password. Supporting more authentication types in the 'import' command is beyond the scope of this authentication-order feature. Therefore, no need to change.
    - **Modify buildSession ? <span style="color:green">No</span>**

- imperative\src\rest\src\client\AbstractRestClient.ts
  
  This class is the only class to use the recently created ISession.authTypeOrder property, which is an array of authentication types supplied in the order in which they should be selected.
  
  - buildOptions - This function tests for the authentication based on the order in which they occur in ISession.authTypeOrder. Therefore, no need to change.
    
    - **Modify buildOptions ? <span style="color:green">No</span>**
  
  - constructor - This function currently hard-codes an order of authentication types into the ISession.authTypeOrder array contained the supplied session. After AuthOrder is implemented, the ISession.authTypeOrder array should already be set in the session which is passed as an argument to this constructor. We should remove the logic that hard-codes the authTypeOrder into the session.
    
    - **Modify constructor?   <span style="color:orange">yes</span>**
  
  - Each of the following functions reference AUTH_TYPE_XXX to a place an identified type into the ISession.type property of the session. Since buildOptions calls just one of the following functions based on being the first available authentication in the ISession.authTypeOrder array, none of these functions need to change. Note that these functions may no longer be necessary since AuthOrder.putTopAuthInSession should have already set the ISession.type property.
    
    - **Modify setBearerAuth ? <span style="color:green">No</span>**
    
    - **Modify setCertPemAuth ? <span style="color:green">No</span>**
    
    - **Modify setPasswordAuth ? <span style="color:green">No</span>**
    
    - **Modify setTokenAuth ? <span style="color:green">No</span>**

- imperative\src\rest\src\session\AbstractSession.ts
  
  - buildSession - This private function is called by the constructor, which accepts an Isession object. A caller could populate multiple authentications (and related properties) into that supplied session. Ideally the caller of the Session.constructor will have already called ConnectionPropsForSessCfg.addPropsOrPrompt() which will have already removed all but the highest priority available authentication from the session. We should confirm that this always true. If not, buildSession may have to call AuthOrder.putTopAuthInSession. We should also check whether assignments to session properties by buildSession will override any of the properties set by AuthOrder.putTopAuthInSession.
    
    - **Modify buildSession ? <span style="color:cyan">Maybe</span>**
  
  - DEFAULT_TYPE - This is simply a constant definition set to AUTH_TYPE_NONE. It is not used in any CLI or ZE code outside of this AbstractSession class. Because it is a public property, it cannot be removed without risk of breaking change. If AUTH_TYPE_NONE is added to the ISession.authTypeOrder array, DEFAULT_TYPE should be deprecated.
    
    - **Modify DEFAULT_TYPE ? <span style="color:orange">Yes</span>**

- imperative\src\rest\src\session\ConnectionPropsForSessCfg.ts
  
  - addPropsOrPrompt - Near the end of this function, a call to AuthOrder.putTopAuthInSession will ensure that the right authentication resides in the session.
    
    - **Modify addPropsOrPrompt ? <span style="color:orange">Yes</span>**
  
  - resolveSessCfgProps - Several functions call this function before creating a new session. Either this function must call AuthOrder.putTopAuthInSession, or each caller of resolveSessCfgProps must first call putTopAuthInSession.
    
    - **Modify resolveSessCfgProps ? <span style="color:cyan">Maybe</span>**
  
  - setTypeForTokenRequest - This function handles setting authentication to AUTH_TYPE_TOKEN to get a token back from user & password. This does not appear to require any change, but it should be revisited after resolveSessCfgProps is refactored.
    
    - **Modify setTypeForTokenRequest ? <span style="color:cyan">Maybe</span>**

- imperative\src\rest\src\session\SessConstants.ts
  
  - Constants and type definitions of AUTH_TYPE_XXX are what they need to be.
    - **Modify constants ? <span style="color:green">No</span>**

- imperative\src\rest\src\session\Session.ts
  
  - createFromUrl - This function is only called from ImportHandler.buildSession to enable importing a config from a URL. As with ImportHandler.buildSession, the use of AUTH_TYPE_BASIC when user & password exist is appropriate and should not need to change.
    - **Modify createFromUrl ? <span style="color:green">No</span>**

- imperative\src\rest\src\session\doc\IOptionsForAddConnProps.ts
  
  - supportedAuthTypes - Our set of supported authentications will not change as part of this feature.
    - **Modify supportedAuthTypes ? <span style="color:green">No</span>**

- imperative\src\rest\src\session\doc\ISession.ts
  
  - authTypeOrder - This property is used to hold the order of authentication types. It is currently populated by hard-coded login and is only used in AbstractRestClient.constructor & AbstractRestClient.buildOptions. There is no reason to change this property. AuthOrder.putTopAuthInSession should populate authTypeOrder's set of values based on customer input. The only change for authTypeOrder will be to remove the comment that states that this property is hard-coded.
    
    - **Modify authTypeOrder ? <span style="color:orange">Yes</span>**

- packages\zosuss\src\SshBaseHandler.ts
  
  - process - This function explicitly sets a property named **supportedAuthTypes** to AUTH_TYPE_BASIC. It is unclear why there is no option in this logic to use an ssh-key.
    - **Modify process ? <span style="color:cyan">Maybe</span>**
  
  packages\zosuss\src\Shell.ts
  
  - connect - This function explicitly checks for an ssh key (first) or a password (second) in a hard-coded fashion. If we want the user's authOrder to apply to ssh connections, this function must call the proposed AuthOrder.putTopAuthInSession to to make the right authentication choice.
    - **Modify connect ? <span style="color:orange">Yes</span>**

## Functions that reference rejectUnauthorized may need modification

If we treat **authOrder** like other connection properties, those functions that process **rejectUnauthorized** may also need to process **authOrder**. This section contains an assessment of whether each such function must be modified.

- packages\cli\src\config\auto-init\ApimlAutoInitHandler.ts
  
  - doAutoInit - This function was analyzed in the previous section of this document.
    - **Modify doAutoInit ? <span style="color:green">No</span>**

- packages\cli\src\imperative.ts
  
  - This class provides definitions used to create the Zowe command tree and other CLI operating properties. It includes command-line options for connection properties (like host, port, user, and password). We must add **authOrder** as a new command line option into this class.
    - **Modify imperative.ts? <span style="color:orange">Yes</span>**

- packages\core\src\constants\Core.constants.ts
  
  - BaseProfile - This object contains a schema definition for a base profile. An authOrder property must be added to this object.
    - **Modify BaseProfile ? <span style="color:orange">Yes</span>**

- packages\imperative\src\config\src\ProfileInfo.ts
  
  - createSession - This function creates a session with key connection properties. Depending on the modification choices made for ConnectionPropsForSessCfg.resolveSessCfgProps, this function may have to call AuthOrder.putTopAuthInSession directly.
    - **Modify createSession ? <span style="color:orange">Yes</span>**

- packages\imperative\src\imperative\src\config\cmd\import\import.handler.ts
  
  - buildSession - This function was analyzed in the previous section of this document.
    - **Modify buildSession ? <span style="color:green">No</span>**

- packages\imperative\src\rest\src\client\AbstractRestClient.ts
  
  - buildOptions - This function was analyzed in the previous section of this document.
    - **Modify buildOptions ? <span style="color:green">No</span>**

- packages\imperative\src\rest\src\client\ProxySettings.ts
  
  - getProxyAgent - This function requires an ISession object. The ISession.authTypeOrder should have already been populated. Therefore, no change should be required in getProxyAgent
    - **Modify getProxyAgent ? <span style="color:green">No</span>**

- packages\imperative\src\rest\src\client\doc\IHTTPSOptions.ts
  
  - IHTTPSOptions - This interface is only used by AbstractRestClient. Credentials are never extracted from nor added to this an instance of this interface. Therefore there is no reason to add authOrder to this interface.
    - **Modify IHTTPSOptions ? <span style="color:green">No</span>**

- packages\imperative\src\rest\src\session\AbstractSession.ts
  
  - buildSession - This function was analyzed in the previous section of this document.
    - **Modify buildSession ? <span style="color:cyan">Maybe</span>**

- packages\imperative\src\rest\src\session\doc\ISession.ts
  
  - authTypeOrder - This property was analyzed in the previous section of this document.
    - **Modify authTypeOrder ? <span style="color:green">No</span>**

- packages\zosjobs\src\GetJobs.ts
  
  - getJob - This function displays rejectUnauthorized in a diagnostic message. No need to process authOrder here.
    - **Modify getJob ? <span style="color:green">No</span>**

- packages\zosmf\src\ZosmfSession.ts
  
  - This Class contains option definitions for connection properties that can be defined in profiles. A definition of the authOrder connection property with a name like ZOSMF_OPTION_AUTH_ORDER should be added.
    - **Modify ZosmfSession.ts ? <span style="color:orange">Yes</span>**

- packages\zosmf\src\constants\Zosmf.messages.ts
  
  - This class provides message text used to display error details. There is no clear reason to add authOrder to this class.
    - **Modify Zosmf.messages.ts ? <span style="color:green">No</span>**

- packages\zosmf\src\constants\Zosmf.profile.ts
  
  - ZosmfProfile - This class provides the property definitions for a zosmf profile type. We must add a definition for the authOrder property.
    - **Modify Zosmf.profile.ts ? <span style="color:orange">Yes</span>**

## 