import React from 'react';
import {shallow} from 'enzyme';
import {QueryRenderer} from 'react-relay';

import IssueishDetailContainer from '../../lib/containers/issueish-detail-container';
import {cloneRepository, buildRepository} from '../helpers';
import {queryBuilder} from '../builder/graphql/query';
import GithubLoginModel from '../../lib/models/github-login-model';
import RefHolder from '../../lib/models/ref-holder';
import {getEndpoint} from '../../lib/models/endpoint';
import {InMemoryStrategy, UNAUTHENTICATED, INSUFFICIENT} from '../../lib/shared/keytar-strategy';
import ObserveModel from '../../lib/views/observe-model';
import IssueishDetailItem from '../../lib/items/issueish-detail-item';
import IssueishDetailController from '../../lib/controllers/issueish-detail-controller';

import rootQuery from '../../lib/containers/__generated__/issueishDetailContainerQuery.graphql';

describe('IssueishDetailContainer', function() {
  let atomEnv, loginModel, repository;

  beforeEach(async function() {
    atomEnv = global.buildAtomEnvironment();
    loginModel = new GithubLoginModel(InMemoryStrategy);
    repository = await buildRepository(await cloneRepository());
  });

  afterEach(function() {
    atomEnv.destroy();
  });

  function buildApp(override = {}) {
    const props = {
      endpoint: getEndpoint('github.com'),

      owner: 'atom',
      repo: 'github',
      issueishNumber: 123,

      selectedTab: 0,
      onTabSelected: () => {},
      onOpenFilesTab: () => {},

      repository,
      loginModel,

      workspace: atomEnv.workspace,
      commands: atomEnv.commands,
      keymaps: atomEnv.keymaps,
      tooltips: atomEnv.tooltips,
      config: atomEnv.config,

      switchToIssueish: () => {},
      onTitleChange: () => {},
      destroy: () => {},

      itemType: IssueishDetailItem,
      refEditor: new RefHolder(),

      ...override,
    };

    return <IssueishDetailContainer {...props} />;
  }

  it('renders a spinner while the token is being fetched', async function() {
    const wrapper = shallow(buildApp());
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')(null);

    const repoData = await tokenWrapper.find(ObserveModel).prop('fetchData')(
      tokenWrapper.find(ObserveModel).prop('model'),
    );
    const repoWrapper = tokenWrapper.find(ObserveModel).renderProp('children')(repoData);

    // Don't render the GraphQL query before the token is available
    assert.isTrue(repoWrapper.exists('LoadingView'));
  });

  it('renders a login prompt if the user is unauthenticated', function() {
    const wrapper = shallow(buildApp());
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: UNAUTHENTICATED});

    assert.isTrue(tokenWrapper.exists('GithubLoginView'));
  });

  it("renders a login prompt if the user's token has insufficient scopes", function() {
    const wrapper = shallow(buildApp());
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: INSUFFICIENT});

    assert.isTrue(tokenWrapper.exists('GithubLoginView'));
    assert.match(tokenWrapper.find('p').text(), /re-authenticate/);
  });

  it('passes the token to the login model on login', async function() {
    sinon.stub(loginModel, 'setToken').resolves();

    const wrapper = shallow(buildApp({
      endpoint: getEndpoint('github.enterprise.horse'),
    }));
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: UNAUTHENTICATED});

    await tokenWrapper.find('GithubLoginView').prop('onLogin')('4321');
    assert.isTrue(loginModel.setToken.calledWith('https://github.enterprise.horse', '4321'));
  });

  it('renders a spinner while repository data is being fetched', function() {
    const wrapper = shallow(buildApp());
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: '1234'});
    const repoWrapper = tokenWrapper.find(ObserveModel).renderProp('children')(null);

    const props = queryBuilder(rootQuery).build();
    const resultWrapper = repoWrapper.find(QueryRenderer).renderProp('render')({
      error: null, props, retry: () => {},
    });

    assert.isTrue(resultWrapper.exists('LoadingView'));
  });

  it('renders a spinner while the GraphQL query is being performed', async function() {
    const wrapper = shallow(buildApp());
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: '1234'});

    const repoData = await tokenWrapper.find(ObserveModel).prop('fetchData')(
      tokenWrapper.find(ObserveModel).prop('model'),
    );
    const repoWrapper = tokenWrapper.find(ObserveModel).renderProp('children')(repoData);

    const resultWrapper = repoWrapper.find(QueryRenderer).renderProp('render')({
      error: null, props: null, retry: () => {},
    });

    assert.isTrue(resultWrapper.exists('LoadingView'));
  });

  it('renders an error view if the GraphQL query fails', async function() {
    const wrapper = shallow(buildApp({
      endpoint: getEndpoint('github.enterprise.horse'),
    }));
    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: '1234'});

    const repoData = await tokenWrapper.find(ObserveModel).prop('fetchData')(
      tokenWrapper.find(ObserveModel).prop('model'),
    );
    const repoWrapper = tokenWrapper.find(ObserveModel).renderProp('children')(repoData);

    const error = new Error('wat');
    error.rawStack = error.stack;
    const retry = sinon.spy();
    const resultWrapper = repoWrapper.find(QueryRenderer).renderProp('render')({
      error, props: null, retry,
    });

    const errorView = resultWrapper.find('QueryErrorView');
    assert.strictEqual(errorView.prop('error'), error);

    errorView.prop('retry')();
    assert.isTrue(retry.called);

    sinon.stub(loginModel, 'removeToken').resolves();
    await errorView.prop('logout')();
    assert.isTrue(loginModel.removeToken.calledWith('https://github.enterprise.horse'));

    sinon.stub(loginModel, 'setToken').resolves();
    await errorView.prop('login')('1234');
    assert.isTrue(loginModel.setToken.calledWith('https://github.enterprise.horse', '1234'));
  });

  it('passes GraphQL query results to its IssueishDetailController', async function() {
    const wrapper = shallow(buildApp({
      owner: 'smashwilson',
      repo: 'pushbot',
      issueishNumber: 4000,
    }));

    const tokenWrapper = wrapper.find(ObserveModel).renderProp('children')({token: '1234'});

    const repoData = await tokenWrapper.find(ObserveModel).prop('fetchData')(
      tokenWrapper.find(ObserveModel).prop('model'),
    );
    const repoWrapper = tokenWrapper.find(ObserveModel).renderProp('children')(repoData);

    const variables = repoWrapper.find(QueryRenderer).prop('variables');
    assert.strictEqual(variables.repoOwner, 'smashwilson');
    assert.strictEqual(variables.repoName, 'pushbot');
    assert.strictEqual(variables.issueishNumber, 4000);

    const props = queryBuilder(rootQuery).build();
    const resultWrapper = repoWrapper.find(QueryRenderer).renderProp('render')({
      error: null, props, retry: () => {},
    });

    const controller = resultWrapper.find(IssueishDetailController);

    // GraphQL query results
    assert.strictEqual(controller.prop('repository'), props.repository);

    // Requested repository attributes
    assert.strictEqual(controller.prop('branches'), repoData.branches);

    // The local repository, passed with a different name to not collide with the GraphQL result
    assert.strictEqual(controller.prop('localRepository'), repository);
    assert.strictEqual(controller.prop('workdirPath'), repository.getWorkingDirectoryPath());

    // The GitHub OAuth token
    assert.strictEqual(controller.prop('token'), '1234');
  });
});
