# dock8s

dock8s is a API explorer for Kubernetes APIs defined in Golang.

## Serve API docs

Start a web server on localhost, serving the APIs in the `./apis` directory:

```
dock8s -serve ./apis
```

dock8s will watch the directory for any changes and regenerate the docs as they change.

Specify multiple API directories to include all of them in the docs:

```
dock8s -serve ./apis/v1alpha1 ./apis/v1beta1 ./apis/v1
```

## Generate API docs

Generate the API docs to a destination folder:

```
mkdir api-website
dock8s -generate ./api-website ./apis
```
