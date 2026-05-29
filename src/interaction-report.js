import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { relativeAssetHref, reportRelativePaths } from "./paths.js";
import {
  cleanGithubTrendDescription,
  cleanProjectDescription,
  githubTrendStatusTag,
  modelReleaseTags,
  projectHeatTags
} from "./presentation.js";

const execFileAsync = promisify(execFile);
const HUGGING_FACE_ICON =
  "data:image/svg+xml;base64," +
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NSIgaGVpZ2h0PSI4OCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0ZGRDIxRSIgZD0iTTQ3LjIxIDc2LjVhMzQuNzUgMzQuNzUgMCAxIDAgMC02OS41IDM0Ljc1IDM0Ljc1IDAgMCAwIDAgNjkuNVoiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTgxLjk2IDQxLjc1YTM0Ljc1IDM0Ljc1IDAgMSAwLTY5LjUgMCAzNC43NSAzNC43NSAwIDAgMCA2OS41IDBabS03My41IDBhMzguNzUgMzguNzUgMCAxIDEgNzcuNSAwIDM4Ljc1IDM4Ljc1IDAgMCAxLTc3LjUgMFoiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZD0iTTU4LjUgMzIuM2MxLjI4LjQ0IDEuNzggMy4wNiAzLjA3IDIuMzhhNSA1IDAgMSAwLTYuNzYtMi4wN2MuNjEgMS4xNSAyLjU1LS43MiAzLjctLjMyWk0zNC45NSAzMi4zYy0xLjI4LjQ0LTEuNzkgMy4wNi0zLjA3IDIuMzhhNSA1IDAgMSAxIDYuNzYtMi4wN2MtLjYxIDEuMTUtMi41Ni0uNzItMy43LS4zMloiIC8+PHBhdGggZmlsbD0iI0ZGMzIzRCIgZD0iTTQ2Ljk2IDU2LjI5YzkuODMgMCAxMy04Ljc2IDEzLTEzLjI2IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNi0yLjMzIDEuMTUtNS40NiAyLjc0LTguOSAyLjc0LTcuMTkgMC0xMy02Ljg4LTEzLTIuMzhzMy4xNiAxMy4yNiAxMyAxMy4yNloiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzkuNDMgNTRhOC43IDguNyAwIDAgMSA1LjMtNC40OWMuNC0uMTIuODEuNTcgMS4yNCAxLjI4LjQuNjguODIgMS4zNyAxLjI0IDEuMzcuNDUgMCAuOS0uNjggMS4zMy0xLjM1LjQ1LS43Ljg5LTEuMzggMS4zMi0xLjI1YTguNjEgOC42MSAwIDAgMSA1IDQuMTdjMy43My0yLjk0IDUuMS03Ljc0IDUuMS0xMC43IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNmwtLjE0LjA3Yy0yLjMxIDEuMTUtNS4zOSAyLjY3LTguNzcgMi42N3MtNi40NS0xLjUyLTguNzctMi42N2MtMi42LTEuMjktNC4yMy0yLjEtNC4yMy4yOSAwIDMuMDUgMS40NiA4LjA2IDUuNDcgMTAuOTdaIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTcwLjcxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTI0LjIxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTE3LjUyIDQ4Yy0xLjYyIDAtMy4wNi42Ni00LjA3IDEuODdhNS45NyA1Ljk3IDAgMCAwLTEuMzMgMy43NiA3LjEgNy4xIDAgMCAwLTEuOTQtLjNjLTEuNTUgMC0yLjk1LjU5LTMuOTQgMS42NmE1LjggNS44IDAgMCAwLS44IDcgNS4zIDUuMyAwIDAgMC0xLjc5IDIuODJjLS4yNC45LS40OCAyLjguOCA0Ljc0YTUuMjIgNS4yMiAwIDAgMC0uMzcgNS4wMmMxLjAyIDIuMzIgMy41NyA0LjE0IDguNTIgNi4xIDMuMDcgMS4yMiA1Ljg5IDIgNS45MSAyLjAxYTQ0LjMzIDQ0LjMzIDAgMCAwIDEwLjkzIDEuNmM1Ljg2IDAgMTAuMDUtMS44IDEyLjQ2LTUuMzQgMy44OC01LjY5IDMuMzMtMTAuOS0xLjctMTUuOTItMi43Ny0yLjc4LTQuNjItNi44Ny01LTcuNzctLjc4LTIuNjYtMi44NC01LjYyLTYuMjUtNS42MmE1LjcgNS43IDAgMCAwLTQuNiAyLjQ2Yy0xLTEuMjYtMS45OC0yLjI1LTIuODYtMi44MkE3LjQgNy40IDAgMCAwIDE3LjUyIDQ4Wm0wIDRjLjUxIDAgMS4xNC4yMiAxLjgyLjY1IDIuMTQgMS4zNiA2LjI1IDguNDMgNy43NiAxMS4xOC41LjkyIDEuMzcgMS4zMSAyLjE0IDEuMzEgMS41NSAwIDIuNzUtMS41My4xNS0zLjQ4LTMuOTItMi45My0yLjU1LTcuNzItLjY4LTguMDEuMDgtLjAyLjE3LS4wMi4yNC0uMDIgMS43IDAgMi40NSAyLjkzIDIuNDUgMi45M3MyLjIgNS41MiA1Ljk4IDkuM2MzLjc3IDMuNzcgMy45NyA2LjggMS4yMiAxMC44My0xLjg4IDIuNzUtNS40NyAzLjU4LTkuMTYgMy41OC0zLjgxIDAtNy43My0uOS05LjkyLTEuNDYtLjExLS4wMy0xMy40NS0zLjgtMTEuNzYtNyAuMjgtLjU0Ljc1LS43NiAxLjM0LS43NiAyLjM4IDAgNi43IDMuNTQgOC41NyAzLjU0LjQxIDAgLjctLjE3LjgzLS42Ljc5LTIuODUtMTIuMDYtNC4wNS0xMC45OC04LjE3LjItLjczLjcxLTEuMDIgMS40NC0xLjAyIDMuMTQgMCAxMC4yIDUuNTMgMTEuNjggNS41My4xMSAwIC4yLS4wMy4yNC0uMS43NC0xLjIuMzMtMi4wNC00LjktNS4yLTUuMjEtMy4xNi04Ljg4LTUuMDYtNi44LTcuMzMuMjQtLjI2LjU4LS4zOCAxLS4zOCAzLjE3IDAgMTAuNjYgNi44MiAxMC42NiA2LjgyczIuMDIgMi4xIDMuMjUgMi4xYy4yOCAwIC41Mi0uMS42OC0uMzguODYtMS40Ni04LjA2LTguMjItOC41Ni0xMS4wMS0uMzQtMS45LjI0LTIuODUgMS4zMS0yLjg1WiIgLz48cGF0aCBmaWxsPSIjRkZEMjFFIiBkPSJNMzguNiA3Ni42OWMyLjc1LTQuMDQgMi41NS03LjA3LTEuMjItMTAuODQtMy43OC0zLjc3LTUuOTgtOS4zLTUuOTgtOS4zcy0uODItMy4yLTIuNjktMi45Yy0xLjg3LjMtMy4yNCA1LjA4LjY4IDguMDEgMy45MSAyLjkzLS43OCA0LjkyLTIuMjkgMi4xNy0xLjUtMi43NS01LjYyLTkuODItNy43Ni0xMS4xOC0yLjEzLTEuMzUtMy42My0uNi0zLjEzIDIuMi41IDIuNzkgOS40MyA5LjU1IDguNTYgMTEtLjg3IDEuNDctMy45My0xLjcxLTMuOTMtMS43MXMtOS41Ny04LjcxLTExLjY2LTYuNDRjLTIuMDggMi4yNyAxLjU5IDQuMTcgNi44IDcuMzMgNS4yMyAzLjE2IDUuNjQgNCA0LjkgNS4yLS43NSAxLjItMTIuMjgtOC41My0xMy4zNi00LjQtMS4wOCA0LjExIDExLjc3IDUuMyAxMC45OCA4LjE1LS44IDIuODUtOS4wNi01LjM4LTEwLjc0LTIuMTgtMS43IDMuMjEgMTEuNjUgNi45OCAxMS43NiA3LjAxIDQuMyAxLjEyIDE1LjI1IDMuNDkgMTkuMDgtMi4xMloiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTc3LjQgNDhjMS42MiAwIDMuMDcuNjYgNC4wNyAxLjg3YTUuOTcgNS45NyAwIDAgMSAxLjMzIDMuNzYgNy4xIDcuMSAwIDAgMSAxLjk1LS4zYzEuNTUgMCAyLjk1LjU5IDMuOTQgMS42NmE1LjggNS44IDAgMCAxIC44IDcgNS4zIDUuMyAwIDAgMSAxLjc4IDIuODJjLjI0LjkuNDggMi44LS44IDQuNzRhNS4yMiA1LjIyIDAgMCAxIC4zNyA1LjAyYy0xLjAyIDIuMzItMy41NyA0LjE0LTguNTEgNi4xLTMuMDggMS4yMi01LjkgMi01LjkyIDIuMDFhNDQuMzMgNDQuMzMgMCAwIDEtMTAuOTMgMS42Yy01Ljg2IDAtMTAuMDUtMS44LTEyLjQ2LTUuMzQtMy44OC01LjY5LTMuMzMtMTAuOSAxLjctMTUuOTIgMi43OC0yLjc4IDQuNjMtNi44NyA1LjAxLTcuNzcuNzgtMi42NiAyLjgzLTUuNjIgNi4yNC01LjYyYTUuNyA1LjcgMCAwIDEgNC42IDIuNDZjMS0xLjI2IDEuOTgtMi4yNSAyLjg3LTIuODJBNy40IDcuNCAwIDAgMSA3Ny40IDQ4Wm0wIDRjLS41MSAwLTEuMTMuMjItMS44Mi42NS0yLjEzIDEuMzYtNi4yNSA4LjQzLTcuNzYgMTEuMThhMi40MyAyLjQzIDAgMCAxLTIuMTQgMS4zMWMtMS41NCAwLTIuNzUtMS41My0uMTQtMy40OCAzLjkxLTIuOTMgMi41NC03LjcyLjY3LTguMDFhMS41NCAxLjU0IDAgMCAwLS4yNC0uMDJjLTEuNyAwLTIuNDUgMi45My0yLjQ1IDIuOTNzLTIuMiA1LjUyLTUuOTcgOS4zYy0zLjc4IDMuNzctMy45OCA2LjgtMS4yMiAxMC44MyAxLjg3IDIuNzUgNS40NyAzLjU4IDkuMTUgMy41OCAzLjgyIDAgNy43My0uOSA5LjkzLTEuNDYuMS0uMDMgMTMuNDUtMy44IDExLjc2LTctLjI5LS41NC0uNzUtLjc2LTEuMzQtLjc2LTIuMzggMC02LjcxIDMuNTQtOC41NyAzLjU0LS40MiAwLS43MS0uMTctLjgzLS42LS44LTIuODUgMTIuMDUtNC4wNSAxMC45Ny04LjE3LS4xOS0uNzMtLjctMS4wMi0xLjQ0LTEuMDItMy4xNCAwLTEwLjIgNS41My0xMS42OCA1LjUzLS4xIDAtLjE5LS4wMy0uMjMtLjEtLjc0LTEuMi0uMzQtMi4wNCA0Ljg4LTUuMiA1LjIzLTMuMTYgOC45LTUuMDYgNi44LTcuMzMtLjIzLS4yNi0uNTctLjM4LS45OC0uMzgtMy4xOCAwLTEwLjY3IDYuODItMTAuNjcgNi44MnMtMi4wMiAyLjEtMy4yNCAyLjFhLjc0Ljc0IDAgMCAxLS42OC0uMzhjLS44Ny0xLjQ2IDguMDUtOC4yMiA4LjU1LTExLjAxLjM0LTEuOS0uMjQtMi44NS0xLjMxLTIuODVaIiAvPjxwYXRoIGZpbGw9IiNGRkQyMUUiIGQ9Ik01Ni4zMyA3Ni42OWMtMi43NS00LjA0LTIuNTYtNy4wNyAxLjIyLTEwLjg0IDMuNzctMy43NyA1Ljk3LTkuMyA1Ljk3LTkuM3MuODItMy4yIDIuNy0yLjljMS44Ni4zIDMuMjMgNS4wOC0uNjggOC4wMS0zLjkyIDIuOTMuNzggNC45MiAyLjI4IDIuMTcgMS41MS0yLjc1IDUuNjMtOS44MiA3Ljc2LTExLjE4IDIuMTMtMS4zNSAzLjY0LS42IDMuMTMgMi4yLS41IDIuNzktOS40MiA5LjU1LTguNTUgMTEgLjg2IDEuNDcgMy45Mi0xLjcxIDMuOTItMS43MXM5LjU4LTguNzEgMTEuNjYtNi40NGMyLjA4IDIuMjctMS41OCA0LjE3LTYuOCA3LjMzLTUuMjMgMy4xNi01LjYzIDQtNC45IDUuMi43NSAxLjIgMTIuMjgtOC41MyAxMy4zNi00LjQgMS4wOCA0LjExLTExLjc2IDUuMy0xMC45NyA4LjE1LjggMi44NSA5LjA1LTUuMzggMTAuNzQtMi4xOCAxLjY5IDMuMjEtMTEuNjUgNi45OC0xMS43NiA3LjAxLTQuMzEgMS4xMi0xNS4yNiAzLjQ5LTE5LjA4LTIuMTJaIiAvPjwvc3ZnPg==";

const PUBLISHER_ICONS = new Map([
  ["Hugging Face", HUGGING_FACE_ICON]
]);
const OPENAI_STATUS_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACHFBMVEVMaXH////////////////////+/v7////////////////////////////////////+/v7////////////+/v7+/v7////////////////////////////////////////////+/v7////////////+/v79/f38/Pz7+/sAAAD4+Pj6+vq/v7/U1NQFBQVmZmb09PTx8fHr6+v5+fnW1tZcXFwWFhYPDw8wMDAaGhqGhoZXV1fFxcU9PT2mpqYtLS3h4eFra2szMzNGRkbs7OwGBgYZGRn29va2trYpKSkuLi5dXV0YGBheXl42NjaHh4ciIiJsbGwlJSWdnZ1oaGjv7+/Hx8c/Pz9PT08yMjKXl5csLCxYWFiNjY2Dg4McHBxDQ0O+vr7V1dWAgIADAwPf3986OjpZWVnk5ORvb28VFRV1dXUeHh5ISEhkZGSLi4uBgYGFhYWxsbGnp6cODg53d3cqKirl5eVfX19QUFDGxsbDw8OCgoISEhJ/f3/e3t719fUQEBAvLy9AQEARERGqqqqIiIgbGxu0tLQnJye1tbXn5+fm5uakpKQ8PDwmJiZtbW1iYmLS0tIICAgJCQkkJCQgICAEBAQ+Pj68vLwoKCibm5sUFBQNDQ0xMTHg4OCcnJxHR0ezs7OgoKDu7u4dHR3ExMTd3d3CwsJMTEzt7e0HBwfJycmioqJNTU1jY2PKysrIyMgXFxcTExM406YOAAAAJHRSTlMAASzMAwL8/f77DYyem9DoKef5MPbtX+wYzl7wG+s3jQw4nZzRy0erAAAACXBIWXMAAAsTAAALEwEAmpwYAAACwElEQVR4nH1TZVcjQRAcYpsQ3IJrze7GBUgCBHd3d3d3PXd3d3f7g/dmFw74cv1l39uprumpriJEKj8VIdFRATGRHBcZExAVTYjKjxwptZooAuKghVRaxKUq2L9/pSL+SWEAp+MopA8Qpk8mqsPzkCBwGi0VBF7kJQ4Nh6CQA4SKJAZDpwVl7QAviCIPrQ7BKTJCTRSh0AAU5ryeYrtFRlFoEKogakL8iL+SnfMo6Kypnpydahzs7cpgdBoo/YkfURM9dKzfkZ8pgseqcaausrTDBQod9IwiPAJa0HQMXweFz5vVXA5+qCjfCapFRDghJJAR8LDee4P1DVuLC6ZWwNxdCAE6BBISnwAthdn+wObDZlMGsP38zoIDeTXljCIhnsSCoxSZ97febSM3Gy9ant5cbrhwceKUFTw4xLIbBFR4Poju92jfe/LMWAuY6j1F7hPSmGlECU7AeA7e1nzEJ+PjJcvapQrgauaIRWJQEgNb0dgiWrN8eJjD3j9nfGUF6vtL2BAGwjENBqbh3G1mM5hMmPf++LIDVPVBBDgGENFXBezYbnnnGSA7F99WWjE9AMoABvbKkv7zwO1i4xy7IqcdP39/xuIYc4aBDQkelpHqK8DlG5WPXq8Zv6PtTwlyxiGwIdOgA8Wou2ql3gTUGj0v99rxazd91FMBgUkZKzFYz04sZTUsN7oLC9gMbWVtDZmglAklS32y7BwcC3frtoCMpk18LbXZzftSS8sSUHhaBJzpcLXYNtZxrYkJLS9LWjeFM79oiEd5c5bXB4ozw0inkNctG4bC1VFaWTdjXAUPobbbwTSQDbNvOUqR0dU72Dg1O1ld1lnALti33IFpqeR3WOzFPXlm1n9gWmb7FMn2vCgKMopSyfaJh8GQgyP5XeQFgR4PDkMk6+XosXY5ekn+h+dyeFOPhjfgeHj/F/+/Zvqm8OFp/WAAAAAASUVORK5CYII=";
const GITHUB_BLOG_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABqlBMVEVHcEwYGBgXFxcZFxcYFhYZGRkYFhYYFhYUFBQAAAAcHBwYFRUYFhYZFhYYFRUXFhYXFxcYFhYYFhYYFhYZFhYXFxcYFhYYFhYYFhYaGhoWFhYAAAAAAAAYFRUXFxcYFhYXFxcZFhYYFhYAAAAkJCQAAAAZFBQYFBQSEhIZFRUaFhYgEBAYFhYYFBQYFhYYFhYYFxcYFhYYFhYXFRUXFxcYFhYYFhYYFRUXFhYzAAAXFxcWFhYYFhYYFRUYFhYYGBgZFhYYFRUYFhYYFhYXFxcXFxcYFxcYFhYYFRUYFhYVFRUYFhYXFRUYFhYYFhYZFhYqAAAXFxcZFhYZFRUWFhYZFRUYFxcZFhYZFhYYFhYZFhYZGRkXFxcZFxcYFhYVFRUYFhYXFhYYFhYZFhYYFRUZFhYYFhYYFhYXFRUaFxceDw8YFRUYFhYVFRUZFRUWFhYXFxcYFhYYFhYQEBAaFhYTExMaGhoaGhoYFhYYFhYXFxcaFRUWFhYZFxcYFxcqKioaFBQXFxcYFRUWFhYYFhYYFxcaFBQYFhYYFhYYFRUXFhYaFhYZFhYYFhathGCcAAAAjXRSTlMAICxw/Cnt/hkCCVSxUbOkWfPj9GdD9mnTCiIBBUpa1Tem+wMHBDQ/DptGENtLq8L56qptC3OVSboFWC73a3YqXFbn7FdCqcdfagzBeKz52gZkaD4vSJJyup9HHy16+jB+5OldYa+49WNaEb+MJJAjb7aXEDsbHRT9ghY8Ony/BjIhp0TNkyfx3FX6Rc+4kjohAAABpElEQVQ4y22T5XvCQAzGM6DCYLDB3McGzN3d3d3d3d3d7n9eL6Vr6TVf3iS/9+lzd0kBNJFoyttKTuLSwTBKN9c3CEaEYyWUwaFzPNHE8sRgME8dILqIHdXyzn7CRLRN5ZECMQhLssKTLMQwCkdkLrZIhbPGnKuilC6TXZKlbTSk0VY4gNfcXm+Limrq7Yu0AsTQ7jHlC3iANv29w2jXcyBlUyTwheAYxva+9EIRmDXqDXXYLkqHaUwqmadN6ECQCouoY+xsWhEcgpOKEMcaRDSUwyQVt8F0E9GQDztU5hNYQzca1uAI9Yw1NCBIgyxUG2sYQrALZlQHayhAsAo+VKFCz6vlse2B1YXJR7ZuFNHyWKX0ipD7N54Iz36vQjOy7YG5l0nVtZu4Kr4+6TY7rRRXOWqVveAzaeNOeqj3skJ1pDH/i1OC9cMrIcViScFvfo5sMCm8xyo3noqI5aeUe7kJHCEkwF2icqhHnnyX592GZQQZmjn1Upy8sDlaQ2y89tqZWXQzL+Qinv4U4/oN8NkvhRM5nSGe4lmDBTg/VTK/qHb/AERH3u9xwIrQAAAAAElFTkSuQmCC";

const SOURCE_ICONS = new Map([
  ["OpenAI", OPENAI_STATUS_ICON],
  ["OpenAI News", OPENAI_STATUS_ICON],
  ["OpenAI News RSS", OPENAI_STATUS_ICON],
  ["OpenAI Status", OPENAI_STATUS_ICON],
  ["GitHub Changelog", GITHUB_BLOG_ICON]
]);

export function reportToInteractionInput(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const githubTrending = Array.isArray(report.github_trending) ? report.github_trending : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const qualityStatus = report.quality_status && typeof report.quality_status === "object" ? report.quality_status : null;
  const evidenceAssets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const paths = reportRelativePaths(report.report_date);
  const dataHref = publicAssetUrl(report, paths.dataPath);
  const sections = [
    {
      type: "markdown",
      title: "主体信息",
      group: "main",
      content: formatMainItems(mainItems)
    }
  ];

  if (modelReleases.length > 0) {
    sections.push({
      type: "markdown",
      title: "模型发布",
      group: "main",
      content: formatModelReleases(modelReleases)
    });
  }
  if (qualityStatus && qualityStatus.status !== "ok") {
    sections.push({
      type: "markdown",
      title: "质量状态",
      group: "verification",
      content: formatQualityStatus(qualityStatus)
    });
  }
  if (evidenceAssets.length > 0) {
    sections.push({
      type: "markdown",
      title: "证据图表",
      group: "main",
      content: formatEvidenceAssets(report, evidenceAssets)
    });
  }
  if (hotBlogs.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "热门技术博客",
      group: "main",
      cardClass: "blog-card",
      filterLabel: "博客主题筛选",
      showFilters: false,
      items: formatHotBlogCards(hotBlogs)
    });
  }
  if (githubTrending.length > 0) {
    sections.push({
      type: "markdown",
      title: "GitHub Trending · Top 10 daily",
      group: "projects",
      content: formatGithubTrending(githubTrending)
    });
  }
  if (projects.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "今日值得关注的项目",
      group: "projects",
      cardClass: "project-card",
      filterLabel: "项目领域筛选",
      showFilters: false,
      content: formatProjects(projects),
      items: formatProjectCards(projects)
    });
  }
  const communitySection = formatCommunityLeads(communityLeads, {
    includeHeading: builderObservations.length > 0
  });
  const builderSection = formatBuilderObservations(builderObservations, {
    includeHeading: Boolean(communitySection)
  });
  const signalSections = [builderSection, communitySection].filter(Boolean);
  if (signalSections.length > 0) {
    sections.push({
      type: "markdown",
      title: signalSectionTitle(builderSection, communitySection),
      group: "signals",
      content: signalSections.join("\n\n")
    });
  }
  sections.push(
    {
      type: "markdown",
      title: "信源审计",
      group: "verification",
      appendix: true,
      appendixLabel: "附录",
      collapsed: true,
      summary: "来源、候选池和重试记录，默认折叠。",
      content: formatSourceAudit(report.source_audit)
    },
    {
      type: "markdown",
      title: "自检与产物",
      group: "verification",
      appendix: true,
      appendixLabel: "附录",
      collapsed: true,
      summary: "验证结果、结构化 JSON 和后续规则建议，默认折叠。",
      content: `${formatSelfCheck(report.self_check)}\n\n- ${markdownLink(dataHref, "结构化 JSON")}`
    }
  );

  return {
    title: report.title,
    summary: String(report.summary || "").trim(),
    heroMode: "date-only",
    heroTitle: report.report_date,
    hideHeroSummary: true,
    hideNavigation: true,
    status: "complete",
    template: "research-explainer",
    renderMode: "pre-rendered",
    generatedAt: report.generated_at,
    intent: {
      audience: "3-10 年经验的研发工程师与技术管理者",
      primaryQuestion: `${report.report_date} 有哪些值得跟进的 AI 产品、模型、工程工具和开源项目动态？`,
      decision: "只保留有可回源证据、与工程工作流相关、且通过日报自检的条目。",
      timeBudget: "8 分钟",
      artifactKind: "research",
      successCriteria: [
        "主体信息不强行凑数",
        "项目和 Builder 观察与主体信息分开",
        "信源审计可展开",
        "结构化 JSON 可追溯"
      ]
    },
    sections,
    nextActions: []
  };
}

export async function renderReportWithEffectiveInteract(report, options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const skillDir = await resolveSkillDir(rootDir, options.skillDir);
  const createScript = path.join(skillDir, "scripts", "create-interaction.mjs");
  const scratchDir =
    options.scratchDir || path.join(rootDir, ".tmp", `effective-interact-daily-${process.pid}`);
  const inputDir = path.join(scratchDir, "inputs");
  const outputDir = path.join(scratchDir, "html");
  const inputPath = path.join(inputDir, `${report.report_date}.json`);

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify(reportToInteractionInput(report), null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    "--input",
    inputPath,
    "--out-dir",
    outputDir,
    "--slug",
    `ai-daily-${report.report_date}`,
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  let payload = null;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new PublisherError("effective_interact_output_invalid", "effective-interact 生成器输出不是有效 JSON。", {
      cause: error.message,
      stdout
    });
  }

  if (!payload.ok || !payload.outputPath) {
    throw new PublisherError("effective_interact_generation_failed", "effective-interact 生成器未返回有效 HTML 产物。", payload);
  }

  return normalizePublicHtml(await fs.readFile(payload.outputPath, "utf8"));
}

function publicAssetUrl(report, assetPath) {
  if (report.canonical_url && report.html_path) {
    return new URL(relativeAssetHref(report.html_path, assetPath), report.canonical_url).toString();
  }

  return new URL(assetPath, DEFAULT_SITE.siteUrl).toString();
}

async function resolveSkillDir(rootDir, requestedSkillDir) {
  if (requestedSkillDir) {
    return path.resolve(requestedSkillDir);
  }

  const candidates = [
    path.join(rootDir, ".codex/skills/effective-interact"),
    path.join(process.cwd(), ".codex/skills/effective-interact")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "scripts", "create-interaction.mjs"));
      return path.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return path.resolve(candidates[0]);
}

function normalizePublicHtml(html) {
  return html.replaceAll('rel="noreferrer"', 'rel="noopener noreferrer"');
}

function formatMainItems(items) {
  if (items.length === 0) {
    return "暂无主体信息。";
  }

  return items
    .map((item, index) => {
      const bullets = item.bullets.map((bullet) => `  - ${bullet}`).join("\n");
      const icon = markdownImage(mainItemIconFor(item), item.source);
      const title = markdownLink(item.url, mainItemTitle(item));
      return `${index + 1}. ${icon ? `${icon} ` : ""}**${title}**（${item.event_date}，${item.tier}）\n${bullets}`;
    })
    .join("\n\n");
}

function formatModelReleases(items) {
  if (items.length === 0) {
    return "暂无模型发布。";
  }

  return items
    .map((item) => `- **${item.name}**${formatHighlightTags(modelReleaseTags(item))}（${item.provider}，${item.availability}，${item.event_date}）：${item.summary} ${markdownLink(item.url, item.source)}`)
    .join("\n");
}

function formatGithubTrending(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .slice(0, 10)
    .map((item) => {
      const tag = githubTrendStatusTag(item);
      const tagText = tag ? ` ==${tag}==` : "";
      return `${item.rank}. **${markdownLink(item.url, item.name || item.repo)}**${tagText}：${cleanGithubTrendDescription(item)}`;
    })
    .join("\n");
}

function formatProjects(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => {
      const domains = Array.isArray(item.domains) && item.domains.length > 0 ? `\n  - 领域：${item.domains.join("、")}` : "";
      const useCase = item.use_case ? `\n  - 作用：${item.use_case}` : "";
      return `- **${markdownLink(item.url, item.name)}**${formatHighlightTags(projectHeatTags(item))}：${cleanProjectDescription(item.description)}${domains}${useCase}`;
    })
    .join("\n");
}

function formatProjectCards(items) {
  return items.map((item) => {
    const domains = Array.isArray(item.domains) ? item.domains.filter(Boolean) : [];
    const points = [];
    if (domains.length > 0) {
      points.push({ label: "领域", value: domains.join("、") });
    }
    if (item.use_case) {
      points.push({ label: "作用", value: item.use_case });
    }

    return {
      group: domains[0] || "PROJECTS",
      title: item.name,
      href: item.url,
      titleIcon: siteIconForUrl(item.url),
      body: cleanProjectDescription(item.description),
      tags: projectHeatTags(item),
      points
    };
  });
}

function formatHotBlogCards(items) {
  return items.map((item) => {
    const points = [];
    if (item.publisher) {
      points.push({ label: "发布方", value: item.publisher, icon: publisherIconFor(item) });
    }
    if (item.author) {
      points.push({ label: "作者", value: item.author });
    }
    if (item.event_date) {
      points.push({ label: "日期", value: item.event_date });
    }

    return {
      group: item.topic || item.publisher || "BLOG",
      title: item.title,
      href: item.url,
      titleIcon: siteIconForUrl(item.url),
      body: item.summary || "",
      showGroup: false,
      tags: item.topic ? [item.topic] : [],
      points
    };
  });
}

function publisherIconFor(item) {
  const explicit = item.publisher_icon || item.publisher_icon_data_uri || "";
  if (explicit) {
    return explicit;
  }
  return PUBLISHER_ICONS.get(item.publisher) || "";
}

function mainItemIconFor(item) {
  return item.source_icon || item.source_icon_data_uri || SOURCE_ICONS.get(item.source) || "";
}

function mainItemTitle(item) {
  const source = String(item.source || "").trim();
  const title = String(item.title || "").trim();
  if (!source || title.toLowerCase().startsWith(source.toLowerCase())) {
    return title;
  }
  return `${source}：${title}`;
}

function formatHighlightTags(tags) {
  return tags.length > 0 ? ` ${tags.map((tag) => `==${tag}==`).join(" ")}` : "";
}

function formatBuilderObservations(items, options = {}) {
  if (items.length === 0) {
    return "";
  }

  const content = items
    .map((item) => `- **${item.author}**${item.role ? `（${item.role}）` : ""}：${item.content} ${markdownLink(item.url, item.source || "来源")}`)
    .join("\n");
  return options.includeHeading ? `### Builder 观察\n\n${content}` : content;
}

function formatCommunityLeads(items, options = {}) {
  const leads = items.filter((item) => !isLowSignalStatuspageLead(item));
  if (leads.length === 0) {
    return "";
  }

  const content = leads.map((item) => `- ${item.content} ${markdownLink(item.url, "来源")}`).join("\n");
  return options.includeHeading ? `### 社区线索\n\n${content}` : content;
}

function signalSectionTitle(builderSection, communitySection) {
  if (builderSection && communitySection) {
    return "Builder 观察与社区线索";
  }
  return builderSection ? "Builder 观察" : "社区线索";
}

function isLowSignalStatuspageLead(item) {
  const content = String(item?.content || "").toLowerCase();
  const url = String(item?.url || "");
  if (!isStatuspageUrl(url)) {
    return false;
  }

  return /elevated errors|resolved|troubleshooting|incident|degraded|outage|error rate|\berrors\b|排障|故障|已恢复|已解决|标记 resolved/i.test(content);
}

function isStatuspageUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.startsWith("status.") || hostname.includes("statuspage");
  } catch {
    return false;
  }
}

function formatQualityStatus(status) {
  const reasons = Array.isArray(status.reasons) ? status.reasons : [];
  const affected = Array.isArray(status.affected_sections) ? status.affected_sections : [];
  return [
    `- 状态：${status.status}`,
    reasons.length > 0 ? `- 原因：${reasons.join("、")}` : "",
    affected.length > 0 ? `- 影响板块：${affected.join("、")}` : "",
    status.public_note ? `- 公开说明：${status.public_note}` : ""
  ].filter(Boolean).join("\n");
}

function formatEvidenceAssets(report, assets) {
  return assets.map((asset) => {
    const lines = [
      `### ${asset.title}`,
      "",
      `- 类型：${asset.type}`,
      `- 提取状态：${asset.extraction_status}`,
      `- 来源：${markdownLink(asset.source_url, "source")}`,
      asset.caption ? `- 说明：${asset.caption}` : ""
    ].filter(Boolean);
    if (asset.local_path) {
      lines.push("", markdownImage(relativeAssetHref(report.html_path, asset.local_path), asset.title));
    }
    const table = formatEvidenceTable(asset.data);
    if (table) {
      lines.push("", table);
    }
    return lines.join("\n");
  }).join("\n\n");
}

function formatEvidenceTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) {
    return "";
  }

  const header = rows[0].map((cell) => escapeMarkdownTableCell(cell));
  const body = rows.slice(1).filter(Array.isArray);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map((cell) => escapeMarkdownTableCell(cell)).join(" | ")} |`)
  ].join("\n");
}

function formatSourceAudit(audit) {
  if (!audit) {
    return "未记录信源审计。";
  }

  return [
    formatAuditGroup("GitHub Trending", audit.github_trending),
    formatAuditGroup("Builder 原始源", audit.builder_sources),
    audit.content_sources ? formatAuditGroup("热门博客与访谈源", audit.content_sources) : "",
    audit.search_sources ? formatAuditGroup("搜索 / 新闻影子源", audit.search_sources) : "",
    audit.sources_health ? formatAuditGroup("信源健康检查", audit.sources_health) : ""
  ].filter(Boolean).join("\n\n");
}

function formatAuditGroup(title, group) {
  if (!group) {
    return `### ${title}\n\n未记录。`;
  }

  const sources = Array.isArray(group.sources) && group.sources.length > 0
    ? group.sources.map((source) => `- ${markdownLink(source.url, source.name)}：${source.status}${source.notes ? `，${source.notes}` : ""}`).join("\n")
    : "- 未记录具体来源。";
  const details = [
    `- 检查状态：${group.checked ? "已检查" : "未检查"}`,
    `- 候选 / 入选：${group.candidates_found} / ${group.included}`,
    group.blocked_reason ? `- 阻塞原因：${group.blocked_reason}` : "",
    group.last_successful_feed_at ? `- 上次成功获取：${group.last_successful_feed_at}` : "",
    `- 说明：${group.notes || "无"}`
  ].filter(Boolean);
  return `### ${title}\n\n${details.join("\n")}\n\n${sources}`;
}

function formatSelfCheck(selfCheck) {
  if (!selfCheck) {
    return "未记录自检。";
  }

  const suggestions = Array.isArray(selfCheck.optimization_suggestions) && selfCheck.optimization_suggestions.length > 0
    ? selfCheck.optimization_suggestions
        .map(formatOptimizationSuggestion)
        .join("\n")
    : "- 本轮无新增建议。";
  return `- 主体信息：${selfCheck.main_items}\n- Builder 观察：${selfCheck.builder_observations}\n- 一手链接：${selfCheck.primary_links ? "通过" : "未通过"}\n- 无禁用表达：${selfCheck.no_banned_words ? "通过" : "未通过"}\n- 无无源数字：${selfCheck.no_unsourced_numbers ? "通过" : "未通过"}\n- 说明：${selfCheck.notes || "无"}\n\n### 提示词与规则迭代建议\n\n${suggestions}`;
}

function formatOptimizationSuggestion(item) {
  const title = item.issue || item.observed_issue || item.suggestion || "建议";
  const change = item.suggestion || item.proposed_change || "";
  const firstLine = change ? `- **${title}**：${change}` : `- **${title}**`;
  return `${firstLine}${item.expected_benefit ? `\n  - 为什么要改：${item.expected_benefit}` : ""}`;
}

function markdownLink(url, label) {
  return `[${escapeMarkdownText(label || url)}](${String(url)})`;
}

function markdownImage(url, label) {
  if (!url) {
    return "";
  }
  return `![${escapeMarkdownText(label || "")}](${String(url)})`;
}

function siteIconForUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const letter = hostname.replace(/[^a-z0-9]/g, "").slice(0, 1).toUpperCase() || "L";
    const color = colorForHost(hostname);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="21" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#fff">${letter}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return "";
  }
}

function colorForHost(hostname) {
  let hash = 0;
  for (const char of hostname) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 64% 38%)`;
}

function escapeMarkdownText(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function escapeMarkdownTableCell(value) {
  return escapeMarkdownText(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
